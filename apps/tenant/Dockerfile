FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY package.json ./
COPY apps/tenant/package.json ./apps/tenant/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/tenant ./apps/tenant

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_TENANT_SLUG
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_TENANT_SLUG=$NEXT_PUBLIC_TENANT_SLUG

RUN pnpm --filter=@secureops/shared run build
RUN pnpm --filter=tenant run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/tenant/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/tenant/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/tenant/.next/static ./.next/static

USER nextjs
EXPOSE 3001
ENV PORT=3001
CMD ["node", "server.js"]
