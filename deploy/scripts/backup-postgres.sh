#!/usr/bin/env sh
# Backup Postgres to ./backups/postgres-YYYYMMDD-HHMMSS.sql.gz
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/postgres-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] dumping database to $OUT"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --format=plain' \
  | gzip -c > "$OUT"

echo "[backup] done ($(wc -c < "$OUT") bytes)"
