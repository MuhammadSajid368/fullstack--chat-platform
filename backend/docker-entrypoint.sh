#!/bin/sh
set -eu

echo "[entrypoint] waiting for database..."
ATTEMPTS=60
i=0
until node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
try {
  await p.\$queryRawUnsafe('SELECT 1');
  await p.\$disconnect();
  process.exit(0);
} catch {
  await p.\$disconnect().catch(() => {});
  process.exit(1);
}
" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge "$ATTEMPTS" ]; then
    echo "[entrypoint] database not ready after ${ATTEMPTS}s" >&2
    exit 1
  fi
  sleep 1
done

echo "[entrypoint] applying prisma migrations (migrate deploy)..."
npx prisma migrate deploy

echo "[entrypoint] starting application..."
exec "$@"
