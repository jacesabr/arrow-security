import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Supports MinIO (local dev) or Cloudflare R2 / AWS S3 (production).
// R2: set R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_BUCKET
// MinIO: set MINIO_ENDPOINT + MINIO_ACCESS_KEY + MINIO_SECRET_KEY + MINIO_BUCKET
// AWS S3: set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_REGION + S3_BUCKET (no endpoint)
function makeS3Client(): S3Client {
  const r2AccountId = process.env.R2_ACCOUNT_ID
  const minioEndpoint = process.env.MINIO_ENDPOINT

  if (r2AccountId) {
    return new S3Client({
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: false,
    })
  }

  if (minioEndpoint) {
    return new S3Client({
      endpoint: minioEndpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      },
      forcePathStyle: true,
    })
  }

  // AWS S3 — SDK picks up AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION from env
  return new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
  })
}

const s3 = makeS3Client()

const BUCKET =
  process.env.R2_BUCKET ??
  process.env.MINIO_BUCKET ??
  process.env.S3_BUCKET ??
  'secureops'

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function getUploadPresignedUrl(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3, command, { expiresIn })
}

export async function getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(s3, command, { expiresIn })
}

export async function ensureBucket(): Promise<void> {
  // R2 buckets are created in the Cloudflare dashboard — skip auto-create
  if (process.env.R2_ACCOUNT_ID) return

  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))

    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadMedia',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${BUCKET}/media/*`,
        },
      ],
    })
    await s3.send(new PutBucketPolicyCommand({ Bucket: BUCKET, Policy: policy }))
  }
}
