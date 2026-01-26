FROM oven/bun:1 as builder

WORKDIR /app

# Copy workspace files
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

# Install dependencies
WORKDIR /app/packages/shared
RUN bun install

WORKDIR /app/apps/server
RUN bun install

# Build
RUN bun run build

# Production image
FROM oven/bun:1-slim

WORKDIR /app
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./

ENV NODE_ENV=production

EXPOSE 3000
CMD ["bun", "run", "dist/index.js"]
