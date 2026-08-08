# syntax=docker/dockerfile:1.7
# Production frontend — Vite build + unprivileged nginx (non-root).

ARG NODE_VERSION=22-alpine
ARG NGINX_VERSION=1.27-alpine

FROM node:${NODE_VERSION} AS build
WORKDIR /app

ARG VITE_CHAT_SERVICE_MODE=rest
ARG VITE_API_BASE_URL=/api
ARG VITE_SOCKET_URL=
ARG VITE_API_TIMEOUT_MS=15000
ARG VITE_APP_NAME=Chat

ENV VITE_CHAT_SERVICE_MODE=$VITE_CHAT_SERVICE_MODE \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SOCKET_URL=$VITE_SOCKET_URL \
    VITE_API_TIMEOUT_MS=$VITE_API_TIMEOUT_MS \
    VITE_APP_NAME=$VITE_APP_NAME

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runner

USER root
RUN rm -rf /usr/share/nginx/html/*
COPY deploy/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html
USER nginx

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
