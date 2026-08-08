#!/usr/bin/env sh
# Restore Postgres from a gzipped SQL dump created by backup-postgres.sh
# Usage: ./deploy/scripts/restore-postgres.sh backups/postgres-YYYYMMDD-HHMMSS.sql.gz
set -eu

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 1
fi

DUMP="$1"
ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [ ! -f "$DUMP" ]; then
  echo "File not found: $DUMP" >&2
  exit 1
fi

echo "[restore] WARNING: this replaces data in the running postgres container."
echo "[restore] Restoring from $DUMP"
gzip -dc "$DUMP" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'

echo "[restore] complete — restart backend to clear caches: docker compose -f $COMPOSE_FILE restart backend"
