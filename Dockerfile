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

# Build all workspace packages and apps
RUN npm run build --workspaces --if-present

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/stellar/dist ./packages/stellar/dist
COPY --from=builder /app/packages/banking/dist ./packages/banking/dist

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "apps/api/dist/main.js"]
