# Prisma SQL notes

Production integrity (partial uniques, CHECK constraints) is **embedded in**:

`prisma/migrations/20260714120000_init_chat_platform/migration.sql`

The old `partial_indexes.sql` sidecar is deprecated and must not be used as the source of truth.
