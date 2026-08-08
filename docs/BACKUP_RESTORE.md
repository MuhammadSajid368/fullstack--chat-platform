# Backup and restore

## What to back up

| Data | Volume / path | Method |
|------|----------------|--------|
| PostgreSQL (source of truth) | `postgres_data` | `pg_dump` (logical) — **required** |
| Redis | `redis_data` | Optional (presence/queues ephemeral-ish); AOF on disk |
| Grafana | `grafana_data` | Optional |
| Prometheus | `prometheus_data` | Optional |
| Uploads / object storage | N/A in-repo | Back up your object store separately when enabled |

## Postgres backup

Script: `deploy/scripts/backup-postgres.sh`

```bash
chmod +x deploy/scripts/*.sh
./deploy/scripts/backup-postgres.sh
# writes backups/postgres-YYYYMMDD-HHMMSS.sql.gz
```

Environment overrides:

- `COMPOSE_FILE` (default `docker-compose.prod.yml`)
- `ENV_FILE` (default `.env`)
- `BACKUP_DIR` (default `./backups`)

### Recommended schedule

Run daily via cron or systemd timer:

```cron
15 2 * * * cd /opt/chat-app && ./deploy/scripts/backup-postgres.sh >> /var/log/chat-backup.log 2>&1
```

Retain ≥ 7 daily + 4 weekly copies off-host (S3/GCS/rsync).

## Postgres restore

```bash
# Stop traffic-writing services first (optional but safer)
docker compose -f docker-compose.prod.yml --env-file .env stop backend nginx

./deploy/scripts/restore-postgres.sh backups/postgres-YYYYMMDD-HHMMSS.sql.gz

docker compose -f docker-compose.prod.yml --env-file .env start backend nginx
```

After restore, confirm:

```bash
curl -fsS http://localhost/ready
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=100 backend
```

## Migration + backup policy

1. Always take a logical dump **before** deploying migrations that alter data.
2. Prefer expand/contract migrations; avoid irreversible column drops without a backup.
3. `prisma migrate deploy` runs on every backend container start — keep migration files immutable once shipped.

## Redis

Usually **not** restored for user recovery. To snapshot Redis volume:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec redis redis-cli BGSAVE
# then back up the Docker volume or /data mount
```

## Disaster recovery drill

Quarterly:

1. Restore latest dump into a disposable compose project/name.
2. Run `/ready` and a login smoke test.
3. Record RTO/RPO actuals.
