# Docker

## Images

| Image | Path | Notes |
|-------|------|--------|
| Backend | `backend/Dockerfile` | Multi-stage Node 22 Alpine, non-root `chat` (uid 1001), `dumb-init`, Prisma migrate on start |
| Frontend | `frontend/Dockerfile` | Vite build → `nginxinc/nginx-unprivileged` on 8080 |

## Compose files

| File | Purpose |
|------|---------|
| `docker-compose.dev.yml` | Local/staging-like stack; published ports; gzip-only nginx |
| `docker-compose.prod.yml` | Production; internal network; brotli nginx; Prometheus + Grafana |

## Build locally

```bash
docker build -t chat-backend:local ./backend
docker build -t chat-frontend:local \
  --build-arg VITE_CHAT_SERVICE_MODE=rest \
  --build-arg VITE_API_BASE_URL=/api \
  ./frontend
```

## Edge nginx

- Config: `deploy/nginx/`
- Prod image: `fholzer/nginx-brotli` (gzip + brotli)
- Dev image: `nginx:1.27-alpine` with `nginx.gzip-only.conf` (no brotli directives)
- Features: reverse proxy, Socket.IO upgrade, gzip/brotli, rate limits, static cache headers, security headers

### HTTPS

1. Put certs in `deploy/certs/`.
2. Copy `conf.d/default-ssl.conf.example` → enable a 443 server (merge location blocks from `default.conf`).
3. Uncomment HSTS in `includes/security-headers.conf` when HTTPS is live.
4. Set `CORS_ORIGIN=https://your.domain`.

## Redis

`deploy/redis/redis.conf`: AOF + RDB, `maxmemory-policy allkeys-lru`, dangerous commands renamed.

Backend reconnect: ioredis `maxRetriesPerRequest: 3`, `lazyConnect` + connect at boot (existing app behavior).

## Logging

Compose services use the `json-file` driver with rotation (`max-size` / `max-file`).

Backend logs are structured JSON via Pino when `NODE_ENV=production` (pretty transport only in development).

Nginx access logs use a JSON `log_format`.

```bash
docker compose -f docker-compose.prod.yml logs -f backend nginx
```

## Health checks

| Service | Check |
|---------|--------|
| postgres | `pg_isready` |
| redis | `PING` |
| backend | `GET /ready` (prod) / `/health` (image) |
| frontend | `GET /healthz` |
| nginx | `GET /nginx-health` |

## Troubleshooting

**Backend loop on migrate:** check `DATABASE_URL` user/password and postgres health.

**Cookies missing:** production requires HTTPS (`COOKIE_SECURE=true`). Use dev compose for HTTP.

**Prometheus empty metrics:** ensure `deploy/prometheus/bearer.token` matches `METRICS_TOKEN`.

**Brotli errors on nginx start:** use `nginx.gzip-only.conf` (dev compose) or the brotli image (prod compose).
