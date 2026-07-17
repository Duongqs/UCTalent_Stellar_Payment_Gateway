# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/banking/package.json packages/banking/
COPY packages/stellar/package.json packages/stellar/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Drop committed/stale dist + incremental caches before build.
# Tracked incomplete dist (missing e.g. packages/core/dist/config) plus
# tsbuildinfo caused runtime MODULE_NOT_FOUND for ../config/env.service.
RUN rm -rf \
      packages/*/dist \
      apps/*/dist \
      packages/*/tsconfig.tsbuildinfo \
      packages/*/dist/tsconfig.tsbuildinfo \
      apps/*/dist/tsconfig*.tsbuildinfo \
  && npm run build -w @uc/core \
  && npm run build -w @uc/banking \
  && npm run build -w @uc/stellar \
  && npm run build -w @uc/api

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache curl

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/stellar/package.json ./packages/stellar/
COPY --from=builder /app/packages/stellar/dist ./packages/stellar/dist
COPY --from=builder /app/packages/banking/package.json ./packages/banking/
COPY --from=builder /app/packages/banking/dist ./packages/banking/dist

EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8081/api/health/live || exit 1

CMD ["node", "apps/api/dist/src/main.js"]
