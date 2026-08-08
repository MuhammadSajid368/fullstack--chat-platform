# Presence transactions

Presence uses **Redis as the live source of truth** and **PostgreSQL for durable preferences + lastSeen**. Operations below document atomicity guarantees.

## 1. Status change (`POST /api/presence/status`)

**Goal:** Persist preferred status (`ONLINE` | `AWAY` | `INVISIBLE`) and broadcast the effective visibility change.

1. Read current Redis `presence:user:{id}` (preferred + deviceCount). Fallback to Prisma if missing.
2. **Prisma write** (durable): `users.presencePreferredStatus`.
3. **Redis pipeline** (O(1)): `HSET presence:user:{id} preferredStatus …` + TTL refresh.
4. After both succeed, publish realtime:
   - `INVISIBLE` while devices > 0 → `presence.offline` + optional `presence.lastSeen` (privacy-gated rooms).
   - Leaving `INVISIBLE` while devices > 0 → `presence.online`.
   - Otherwise → `presence.statusChanged`.

No cross-store 2PC. Order is Prisma → Redis → publish so reconnects heal Redis from DB prefs. Publish never runs inside a DB transaction.

## 2. Privacy update (`POST /api/presence/privacy`)

**Goal:** Persist who may observe online/lastSeen (`EVERYONE` | `CONTACTS` | `NOBODY`).

1. **Prisma write**: `users.presencePrivacy`.
2. **Redis pipeline**: `HSET presence:user:{id} privacy …` + TTL refresh.
3. Publish `presence.statusChanged` to `presence:{userId}` watchers with the privacy-filtered snapshot semantics applied by consumers on next fetch / subscribe.

## 3. Last seen update (last device disconnect)

**Goal:** Durable lastSeen when the user transitions to zero devices.

1. **Redis pipeline**: `SREM` device, recompute `SCARD`, delete empty sets / device meta keys.
2. When device count reaches **0**:
   - **Prisma write**: `users.lastSeenAt = now()`.
   - **Redis**: cache `presence:user:{id}` `lastSeenAt` field (+ optional dedicated lastSeen key).
   - Publish `presence.offline` + `presence.lastSeen` (skipped for `INVISIBLE` online suppress path; lastSeen still subject to privacy on read).
3. BullMQ `presence.lastSeen` is a repair/verify hook after publish — not the primary write path.

## Failure notes

| Failure | Behaviour |
|---------|-----------|
| Duplicate disconnect | `SREM` is idempotent; count unchanged → no offline broadcast |
| Redis reconnect | Client reconnect; TTLs drop stale socket IDs; reconnect re-`SADD`s |
| Server restart | In-process maps cleared; Redis TTLs reclaim; clients re-mark online |
| Prisma write fails after Redis | Next heartbeat / status API re-syncs; lastSeen job re-reads |
