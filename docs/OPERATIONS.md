# Operations runbook

## Day-2 operations

### View status

```bash
docker compose -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=200 backend
```

### Rolling restart

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --no-deps --build backend
docker compose -f docker-compose.prod.yml --env-file .env up -d --no-deps --build frontend
docker compose -f docker-compose.prod.yml --env-file .env exec nginx nginx -s reload
```

### Scale note

This compose file runs a **single** backend replica. Horizontal scale requires sticky sessions or shared Redis adapter (already present for Socket.IO) plus a load balancer in front of multiple backend containers. Do not scale blindly without reviewing Socket.IO and rate-limit Redis keys.

## Logging

| Source | Format | Rotation |
|--------|--------|----------|
| backend | Pino JSON (`NODE_ENV=production`) | Docker `json-file` 25m × 5 |
| nginx | JSON access log | Docker `json-file` 25m × 5 |
| postgres / redis | container stdout | same |

Ship logs with your agent (Fluent Bit, Vector, Datadog) by scraping the Docker logging driver or mounting journald.

## Monitoring

- **Prometheus:** internal `prometheus:9090` (not published by default)
- **Grafana:** host port `GRAFANA_PORT` (default 3001)
- Dashboard: **Chat Backend Overview** (folder Chat)
- Alerts: `deploy/prometheus/alerts.yml` (backend down, error rate, latency, dependency health)

Scrape auth: Bearer token from `deploy/prometheus/bearer.token` (= `METRICS_TOKEN`).

```bash
# Manual scrape test from inside the network
docker compose -f docker-compose.prod.yml exec backend \
  wget -qO- --header="Authorization: Bearer $METRICS_TOKEN" http://127.0.0.1:3000/metrics | head
```

## Redis

- Persistence: AOF `everysec` + RDB snapshots (`deploy/redis/redis.conf`)
- Volume: `redis_data`
- Health: compose `redis-cli ping`
- App reconnect: ioredis retries configured in `backend/src/database/redis.ts`

Flushing Redis clears presence/typing/rate-limit counters; sessions live in Postgres.

## Postgres

- Volume: `postgres_data`
- Migrations: automatic `prisma migrate deploy` on backend start
- Backups: [BACKUP_RESTORE.md](./BACKUP_RESTORE.md)

## Incident playbooks

### Site down

1. `curl /nginx-health` `/health` `/ready`
2. `docker compose ps` — look for unhealthy backend/postgres/redis
3. `logs backend` — boot/migrate/JWT/`METRICS_TOKEN` errors
4. Confirm disk space on volumes

### WebSocket failures

1. Confirm `/socket.io/` proxied with `Upgrade` headers (nginx config)
2. Confirm cookies Path=/ and Secure/HTTPS alignment
3. Check redis health (adapter)

### Auth / cookie issues

1. `CORS_ORIGIN` must equal the browser origin exactly
2. `COOKIE_SECURE` requires HTTPS
3. Edge must forward `X-Forwarded-Proto` (configured); backend `trust proxy` is enabled

## Secret rotation

1. Rotate `JWT_*` → forces re-login (refresh tokens invalidated when secrets change)
2. Rotate `METRICS_TOKEN` + update `deploy/prometheus/bearer.token` → restart prometheus + backend
3. Rotate DB password → update `.env` + recreate backend/postgres connection (plan downtime)
