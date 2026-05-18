FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY package.json ./
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/mobile ./apps/mobile

ARG VITE_API_URL
ARG VITE_TENANT_SLUG
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TENANT_SLUG=$VITE_TENANT_SLUG

RUN pnpm --filter=@secureops/shared run build
RUN pnpm --filter=mobile run build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/mobile/dist /usr/share/nginx/html
COPY apps/mobile/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
