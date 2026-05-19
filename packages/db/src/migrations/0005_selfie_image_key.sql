-- Rename image_data (base64 blob) to image_key (S3/R2 object key)
ALTER TABLE selfie_records RENAME COLUMN image_data TO image_key;
