FROM oven/bun:1 AS builder

WORKDIR /app

# Copy root package.json for workspace setup
COPY package.json ./
COPY bun.lockb* ./

# Copy shared package first
COPY packages/shared ./packages/shared

# Copy server package
COPY apps/server ./apps/server

# Install all dependencies (workspace-aware)
RUN bun install --frozen-lockfile || bun install

# Build shared first
WORKDIR /app/packages/shared
RUN bun run build 2>/dev/null || echo "No build script in shared"

# Build server
WORKDIR /app/apps/server
RUN bun run build 2>/dev/null || bun build ./src/index.ts --outdir ./dist --target bun

# Production image
FROM oven/bun:1-slim

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production

EXPOSE 3000
CMD ["bun", "run", "dist/index.js"]
