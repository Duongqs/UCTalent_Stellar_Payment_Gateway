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

# Clean stale committed dist/tsbuildinfo, then build in dependency order:
#   @uc/core → @uc/stellar → @uc/banking → @uc/api
# banking imports @uc/stellar; building banking before stellar fails TS2307.
RUN rm -rf \
      packages/*/dist \
      apps/*/dist \
      packages/*/tsconfig.tsbuildinfo \
      packages/*/dist/tsconfig.tsbuildinfo \
      apps/*/dist/tsconfig*.tsbuildinfo \
  && npm run build -w @uc/core \
  && npm run build -w @uc/stellar \
  && npm run build -w @uc/banking \
  && npm run build -w @uc/api

# ── Runtime stage ────────────────────────────────────────────
# Fresh npm ci here — avoid COPY node_modules from builder.
# Cross-stage copy of node_modules/.bin symlinks often breaks docker pull
# on overlayfs (UtimesNanoAt: no such file or directory).
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache curl

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/banking/package.json packages/banking/
COPY packages/stellar/package.json packages/stellar/

RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/stellar/dist ./packages/stellar/dist
COPY --from=builder /app/packages/banking/dist ./packages/banking/dist
COPY --from=builder /app/scripts/migrations ./scripts/migrations

EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8081/api/health/live || exit 1

CMD ["node", "apps/api/dist/main.js"]
