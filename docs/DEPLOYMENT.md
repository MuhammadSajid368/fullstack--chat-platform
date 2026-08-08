# Deployment guide — production-ready compose stack

## Architecture

```
Browser → nginx (edge:80/443)
            ├─ /            → frontend:8080 (SPA)
            ├─ /api/*       → backend:3000
            └─ /socket.io/* → backend:3000 (WebSocket)
         backend → postgres + redis
         prometheus → scrapes backend:/metrics (token)
         grafana → prometheus
```

## Prerequisites

- Docker Engine 24+ and Compose v2
- 2+ vCPU, 4GB RAM minimum (8GB recommended with Grafana/Prometheus)
- Secrets filled from `.env.production.example`
- TLS certificates in `deploy/certs/` for HTTPS (optional initially)

## First-time production deploy

1. **Clone and configure**

```bash
cp .env.production.example .env
# Edit .env — set POSTGRES_PASSWORD, JWT_*, METRICS_TOKEN, CORS_ORIGIN, GRAFANA_ADMIN_PASSWORD
printf '%s' "$METRICS_TOKEN" > deploy/prometheus/bearer.token
# METRICS_TOKEN must match .env and bearer.token
```

2. **TLS (recommended before real users)**

Place certificates:

- `deploy/certs/fullchain.pem`
- `deploy/certs/privkey.pem`

Enable HTTPS using `deploy/nginx/conf.d/default-ssl.conf.example` (see [DOCKER.md](./DOCKER.md)).

Until TLS is live, browsers will not send `Secure` cookies (`COOKIE_SECURE=true`). Use a tunnel (Caddy/Traefik/Cloudflare) or enable the SSL server block.

3. **Build and start**

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Startup order: postgres/redis healthy → backend (`prisma migrate deploy` then listen) → frontend → nginx → prometheus/grafana.

4. **Verify**

```bash
curl -fsS http://localhost/nginx-health
curl -fsS http://localhost/health
curl -fsS http://localhost/ready
# Grafana: http://localhost:3001
```

5. **Smoke test**

Open `CORS_ORIGIN` in a browser, register/login, send a message, confirm Socket.IO connects (Network → WS).

## Staging / local compose

```bash
cp .env.staging.example .env
docker compose -f docker-compose.dev.yml --env-file .env up --build
# App edge: http://localhost:8080
```

Dev compose forces `COOKIE_SECURE=false` so HTTP cookies work locally.

## Database migrations

Applied automatically by `backend/docker-entrypoint.sh` via:

```bash
npx prisma migrate deploy
```

Never run `prisma migrate dev` against production.

## Rollback

1. Redeploy previous image tags (pin digests in CI/CD).
2. Restore DB from backup if a migration was irreversible — see [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).

## Security checklist

- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` ≥ 32 chars, unique per env
- [ ] `METRICS_TOKEN` set; `/metrics` not exposed on the public nginx (returns 404)
- [ ] `COOKIE_SECURE=true` (prod compose) + HTTPS
- [ ] `CORS_ORIGIN` exact match to public URL
- [ ] Grafana password rotated; not published on the internet without auth gateway
- [ ] Redis `FLUSHALL` renamed away; volume persisted
- [ ] Security headers active (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy)

See also: [DOCKER.md](./DOCKER.md), [OPERATIONS.md](./OPERATIONS.md), [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).
