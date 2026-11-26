FROM oven/bun:1-slim

WORKDIR /app

COPY apps/web/server.ts ./
COPY apps/web/public ./public

ENV NODE_ENV=production

EXPOSE 8080
CMD ["bun", "run", "server.ts"]
