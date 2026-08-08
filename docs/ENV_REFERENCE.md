# Variable reference — see also .env.production.example / .env.staging.example

## Backend runtime

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | yes | `production` / `development` / `test` |
| `HOST` | yes | Bind address (`0.0.0.0` in containers) |
| `PORT` | yes | HTTP port (3000) |
| `API_PREFIX` | yes | API mount path (`/api`) |
| `DATABASE_URL` | yes | Postgres connection string |
| `REDIS_URL` | yes | Redis connection string |
| `JWT_ACCESS_SECRET` | yes | ≥32 chars |
| `JWT_REFRESH_SECRET` | yes | ≥32 chars |
| `JWT_ACCESS_EXPIRES_IN` | no | default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | no | default `7d` |
| `JWT_ISSUER` | no | default `chat-api` |
| `JWT_AUDIENCE` | no | default `chat-web` |
| `COOKIE_NAME` | no | default `chat_session` |
| `COOKIE_SECURE` | prod yes | must be `true` in production |
| `COOKIE_SAME_SITE` | no | `lax` / `strict` / `none` |
| `CORS_ORIGIN` | yes | Exact browser origin |
| `RATE_LIMIT_WINDOW_MS` | no | default 60000 |
| `RATE_LIMIT_MAX` | no | default 100 |
| `LOG_LEVEL` | no | pino level |
| `METRICS_ENABLED` | no | default true |
| `METRICS_ROUTE` | no | default `/metrics` |
| `METRICS_TOKEN` | prod yes | Protects metrics + queue health |
| `METRICS_DEFAULT_LABELS` | no | `k=v,k2=v2` |
| `OTEL_*` | no | Tracing exporter settings |
| `OBSERVABILITY_STARTUP_TIMEOUT_MS` | no | default 60000 |

## Frontend build-time (Vite)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_CHAT_SERVICE_MODE` | yes (prod) | `rest` |
| `VITE_API_BASE_URL` | yes (rest) | `/api` behind nginx |
| `VITE_SOCKET_URL` | no | empty = same origin |
| `VITE_API_TIMEOUT_MS` | no | default 15000 |
| `VITE_APP_NAME` | no | UI title |

## Compose / ops

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` / `PASSWORD` / `DB` | Database bootstrap |
| `HTTP_PORT` / `HTTPS_PORT` | Edge nginx publish |
| `GRAFANA_ADMIN_USER` / `PASSWORD` | Grafana login |
| `GRAFANA_ROOT_URL` | Grafana public URL |
| `TLS_CERTS_DIR` | Host path mounted to `/etc/nginx/certs` |
