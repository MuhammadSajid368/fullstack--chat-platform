# syntax=docker/dockerfile:1.7
# Production backend image — multi-stage, non-root, Prisma migrate on start.

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
# Production node_modules + keep prisma CLI for migrate deploy at runtime
RUN npm prune --omit=dev \
  && npm install prisma@6.9.0 --no-save --no-audit --no-fund

FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

RUN apk add --no-cache libc6-compat openssl dumb-init curl \
  && addgroup -g 1001 -S chat \
  && adduser -S -u 1001 -G chat chat

COPY --from=build --chown=chat:chat /app/node_modules ./node_modules
COPY --from=build --chown=chat:chat /app/dist ./dist
COPY --from=build --chown=chat:chat /app/package.json ./package.json
COPY --from=build --chown=chat:chat /app/prisma ./prisma
COPY --chown=chat:chat docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/logs \
  && chown -R chat:chat /app

USER chat
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
