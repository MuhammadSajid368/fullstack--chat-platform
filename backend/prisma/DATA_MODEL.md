# Chat Platform — PostgreSQL Data Model

**Scope:** schema & design only. No controllers, services, or routes.  
**Frontend SoT:** `frontend/docs/API_CONTRACT.md`, `frontend/src/types/chat.ts`.  
**Prisma schema:** `prisma/schema.prisma`.

---

## 1. ER Diagram

```mermaid
erDiagram
  USER ||--o{ SESSION : has
  USER ||--o{ REFRESH_TOKEN : has
  SESSION ||--o{ REFRESH_TOKEN : links
  USER ||--o{ CONVERSATION_MEMBER : joins
  USER ||--o{ MESSAGE : sends
  USER ||--o{ MESSAGE_READ : reads
  USER ||--o{ PINNED_MESSAGE : pins
  USER ||--o{ STARRED_MESSAGE : stars
  USER ||--o{ NOTIFICATION : receives
  USER ||--o{ AUDIT_LOG : acts
  USER ||--o{ FUTURE_ATTACHMENT : uploads
  USER ||--o{ CONVERSATION : creates

  CONVERSATION ||--o{ CONVERSATION_MEMBER : has
  CONVERSATION ||--o{ MESSAGE : contains
  CONVERSATION ||--o{ GROUP_ROLE : defines
  CONVERSATION ||--o{ PINNED_MESSAGE : shows
  CONVERSATION ||--o{ NOTIFICATION : triggers
  CONVERSATION ||--o{ FUTURE_ATTACHMENT : stores
  CONVERSATION |o--o| MESSAGE : lastMessage

  GROUP_ROLE ||--o{ CONVERSATION_MEMBER : assigned

  MESSAGE ||--o{ MESSAGE : replies
  MESSAGE ||--o{ MESSAGE_READ : receipt
  MESSAGE ||--o{ PINNED_MESSAGE : pin
  MESSAGE ||--o{ STARRED_MESSAGE : star
  MESSAGE ||--o{ FUTURE_ATTACHMENT : files
  MESSAGE ||--o{ NOTIFICATION : notifies
  MESSAGE |o--o{ CONVERSATION_MEMBER : lastReadBy

  USER {
    string id PK
    string email UK_ACTIVE
    string passwordHash
    string name
    datetime deletedAt
  }

  SESSION {
    string id PK
    string userId FK
    string sessionTokenHash UK
    datetime expiresAt
    datetime revokedAt
  }

  REFRESH_TOKEN {
    string id PK
    string userId FK
    string sessionId FK
    string tokenHash UK
    string familyId
    datetime revokedAt
  }

  CONVERSATION {
    string id PK
    enum type
    enum status
    string directPairKey UK
    string lastMessageId FK
    datetime lastMessageAt
    datetime deletedAt
  }

  CONVERSATION_MEMBER {
    string id PK
    string conversationId FK
    string userId FK
    enum role
    int unreadCount
    string lastReadMessageId FK
    boolean muted
    boolean pinned
    datetime leftAt
    datetime deletedAt
  }

  GROUP_ROLE {
    string id PK
    string conversationId FK
    string key
    json permissions
  }

  MESSAGE {
    string id PK
    string conversationId FK
    string senderId FK
    enum type
    enum status
    string clientMessageId
    string replyToMessageId FK
    datetime deletedAt
    datetime createdAt
  }

  MESSAGE_READ {
    string id PK
    string messageId FK
    string userId FK
    datetime readAt
  }

  PINNED_MESSAGE {
    string id PK
    string conversationId FK
    string messageId FK
    int position
  }

  STARRED_MESSAGE {
    string id PK
    string messageId FK
    string userId FK
    datetime deletedAt
  }

  NOTIFICATION {
    string id PK
    string userId FK
    string messageId FK
    enum type
    enum status
    datetime deletedAt
  }

  AUDIT_LOG {
    string id PK
    string actorId FK
    enum action
    string entityType
    string entityId
    json metadata
  }

  FUTURE_ATTACHMENT {
    string id PK
    string messageId FK
    string uploaderId FK
    string storageKey
    enum status
    datetime deletedAt
  }
```

---

## 2. Entity summary (frontend mapping)

| Table | Purpose | Frontend mapping |
|-------|---------|------------------|
| `users` | Identity | `AuthUser` / list `users[]` |
| `sessions` | HttpOnly cookie session | REST cookie auth |
| `refresh_tokens` | JWT refresh rotation (mobile/API) | Future / dual clients |
| `conversations` | Thread | `Conversation` |
| `conversation_members` | Membership + mute/pin/unread | `memberIds`, `muted`, `pinned`, `unreadCount` |
| `group_roles` | Per-group role catalog | Future RBAC; `MemberRole` stays on member |
| `messages` | Chat body | `Message` (+ soft delete) |
| `message_reads` | Who read what | Group receipts; supports `READ` status |
| `pinned_messages` | Pinned banner | `message.pinned` |
| `starred_messages` | Per-user stars | `message.starred` (private) |
| `notifications` | In-app alerts | Future UI |
| `audit_logs` | Compliance trail | Ops / security |
| `attachments` | Object-store metadata | `FutureAttachment` / media types |

**Enum alignment notes**

| Frontend / API (`ApiMessageType`) | Prisma `MessageType` |
|-----------------------------------|----------------------|
| `text` | `TEXT` |
| `image` | `IMAGE` |
| `document` | `DOCUMENT` |
| `link` | `LINK` |
| `reply` | **Not an enum** — use `replyToMessageId` (+ usually `TEXT`) |
| — | `SYSTEM` (server events; no frontend type yet) |

- Wire mapping is lowercase ↔ SCREAMING_SNAKE; values match aside from `reply` / `SYSTEM`.
- Frontend soft-delete flag `deleted` → `messages.deletedAt`.
- Per-user mute/pin live on **member**, not globally on conversation (WhatsApp model). `ConversationStatus.MUTED` is reserved for system-level state.

---

## 2.1 UTC time policy (mandatory)

All absolute timestamps are **UTC**.

| Layer | Rule |
|-------|------|
| **App** | Always write/read `Date` / ISO-8601 with `Z` or offset; never store local wall-clock without zone. Prisma `DateTime` values are treated as UTC instants. |
| **Database** | Postgres `timestamptz` columns. Session/DB default timezone **must be `UTC`** (`ALTER DATABASE … SET timezone TO 'UTC';` and container `TZ=UTC`). |
| **JWT** | `iat` / `exp` / `nbf` are NumericDate (UTC seconds since epoch). |
| **Logs** | Pino timestamps in ISO-8601 UTC. |
| **Containers** | Set `TZ=UTC` (and Node `process.env.TZ=UTC` if needed) so `now()` and log clocks agree. |

Do not rely on the host OS local timezone. Document this in deployment runbooks.

---

## 3. Cascade & constraint rules

| Relationship | On delete | Rationale |
|--------------|-----------|-----------|
| User → Session / RefreshToken | `CASCADE` | Kill auth when user hard-removed |
| User → Message (sender) | `RESTRICT` | Preserve history; soft-delete user instead |
| Conversation → Members / Messages / Pins / GroupRoles | `CASCADE` | Thread deletion removes dependents |
| Message → MessageRead / Stars / Pins | `CASCADE` | Receipts follow message |
| Conversation.lastMessage | `SET NULL` | Avoid cycles on message purge |
| Member.lastReadMessage | `SET NULL` | Safe if message purged |
| Attachment → Message | `SET NULL` | Orphan cleanup job possible |
| Notification → Message | `SET NULL` | Keep notification if message purged |
| Notification → Conversation | `SET NULL` | Keep notification if thread purged |
| AuditLog.actor | `SET NULL` | Keep audit if user erased |

**Uniques**

- Soft-deleted users: **only** `users_email_active_uidx` WHERE `deletedAt IS NULL` — soft-deleted emails may be reused
- Soft-deleted DIRECT pairs: **only** `conversations_directPairKey_active_uidx` WHERE `directPairKey IS NOT NULL AND deletedAt IS NULL`
- `sessions.sessionTokenHash`, `refresh_tokens.tokenHash`
- `conversations.inviteCode`
- `messages (id, conversationId)` — enables composite FKs for pins/attachments
- `messages (conversationId, clientMessageId)` — idempotent send
- Active memberships: **partial** `UNIQUE (conversationId, userId) WHERE leftAt IS NULL AND deletedAt IS NULL`
- One active OWNER: **partial** unique on `conversationId` WHERE `role = OWNER` AND active
- `group_roles (conversationId, key)`
- `message_reads (messageId, userId)`
- `pinned_messages (conversationId, messageId)`
- `starred_messages (messageId, userId)`

**CHECK — DIRECT requires `directPairKey`** (in official migration):

```sql
ALTER TABLE conversations
  ADD CONSTRAINT conversations_direct_pair_key_required
  CHECK (type <> 'DIRECT' OR "directPairKey" IS NOT NULL);
```

**Composite FK — pin / attachment conversation consistency** (declarative; preferred over triggers):

```sql
-- Requires UNIQUE (id, conversationId) on messages
FOREIGN KEY (messageId, conversationId)
  REFERENCES messages (id, conversationId)
```

Used by `pinned_messages` and `attachments`. A pin cannot reference a message from another conversation.

**Attachment CHECK** (closes MATCH SIMPLE hole when `messageId` set but `conversationId` null):

```sql
CHECK ("messageId" IS NULL OR "conversationId" IS NOT NULL)
```

**Partial indexes** — shipped inside `prisma/migrations/20260714120000_init_chat_platform/migration.sql` (not a sidecar).

---

## 3.1 Membership lifecycle (chosen approach)

**Decision: partial unique index for active memberships — do not require row reuse.**

| | |
|--|--|
| **Active** | `leftAt IS NULL AND deletedAt IS NULL` |
| **Leave** | Set `leftAt` (and optionally `deletedAt`); row retained as history |
| **Rejoin** | `INSERT` a **new** membership row (active unique slot is free) |
| **Why not reuse-only?** | Reuse forces every leave/rejoin path to mutate one row; easy to violate if any code path inserts. Partial unique allows history rows + clean rejoin inserts, and matches audit-friendly leave timestamps. |
| **Constraint** | `CREATE UNIQUE INDEX … ON conversation_members (conversationId, userId) WHERE leftAt IS NULL AND deletedAt IS NULL` |

Services (when implemented) must filter `leftAt IS NULL AND deletedAt IS NULL` for authz.

---

## 3.2 User deletion policy

**Users are soft-deleted only.**

- Set `users.deletedAt`; never `DELETE FROM users` in application or admin business flows.
- Hard delete is unsupported: `messages.senderId` uses `ON DELETE RESTRICT`, so hard delete fails if the user sent any message.
- Sessions/tokens cascade only applies to hard delete — soft-delete should revoke sessions explicitly in a future auth service.

---

## 4. Cursor pagination strategy

**Opaque cursor** (never expose raw offsets/page numbers — matches frontend contract):

```
cursor = base64url( createdAt_iso + "|" + messageId )
```

**Query pattern (load older):**

```sql
SELECT *
FROM messages
WHERE conversation_id = $1
  AND deleted_at IS NULL
  AND (created_at, id) < ($cursor_created_at, $cursor_id)  -- for DESC feed
ORDER BY created_at DESC, id DESC
LIMIT $limit;
```

- Newest page: omit cursor → latest `LIMIT` rows, then reverse in API for ASC UI.
- Index: `(conversation_id, created_at DESC, id DESC)`.
- Ties on identical timestamps broken by `id` (cuid still unique; deterministic).
- Soft-deleted rows excluded by default; include tombstones only for sync/backfill channels.

---

## 5. Unread count strategy

**Hybrid watermark + counter** (scale-friendly):

| Field | Role |
|-------|------|
| `conversation_members.unread_count` | Fast inbox badge (O(1) read) |
| `conversation_members.last_read_message_id` | Reconciliation / catch-up |
| `conversation_members.last_read_at` | Presence-ish “seen” |

**On message insert (same TX):**

1. Insert `messages` row.
2. Update `conversations.last_message_*`.
3. `UPDATE conversation_members SET unread_count = unread_count + 1 WHERE conversation_id = ? AND user_id <> sender AND left_at IS NULL`.
4. Sender’s unread unchanged (0 for own sends).

**On mark conversation read:**

1. Insert/upsert `message_reads` for messages after watermark (batch) **or** watermark-only for DIRECT.
2. Set `last_read_message_id`, `last_read_at = now()`, `unread_count = 0`.

**Reconciliation job (async):** recompute unread from `messages.created_at > last_read_at` if counter drifts (WebSocket races, restores).

---

## 6. Read receipt strategy

| Chat type | Mechanism |
|-----------|-----------|
| **DIRECT** | Advance `messages.status`: `SENT → DELIVERED → READ`. Optionally still write `message_reads` for analytics. |
| **GROUP** | One `message_reads` row per `(messageId, userId)`. UI aggregates “Seen by N”. Sender `status` may stop at `DELIVERED` unless all members read (product choice). |

**Optimistic UI:** client shows local `SENDING`; server acknowledges → `SENT`; peer devices / WS events → `DELIVERED` / `READ`.

Do **not** put N booleans on `messages`. Receipt fan-out is relational + WS events.

---

## 7. Message ordering strategy

1. **Canonical order:** `(created_at ASC, id ASC)` within a conversation.
2. **Server clock:** `created_at` set by DB `now()` (reject client clocks for ordering).
3. **Client idempotency:** `client_message_id` does not affect order; retries return the same row.
4. **Edits:** mutate `content` / `updated_at`; order key stays `created_at`.
5. **System messages:** `type = SYSTEM`, same ordering stream (added/removed member, etc.).

---

## 8. Group ownership strategy

- Exactly **one** active `OWNER` per group (partial unique index).
- `ADMIN` may manage members but not delete the group / transfer ownership (enforce in service layer later).
- **Leave rules (frontend `mustTransferOwnershipBeforeLeave`):**
  - If sole owner and other members remain → require `OWNERSHIP_TRANSFER` audit + role swap in one TX.
  - If last member leaves → soft-delete conversation.
- Seed `group_roles` system keys `owner` / `admin` / `member` on group create; `ConversationMember.role` is what authorization checks.

---

## 9. Idempotent send & optimistic UI

```
UNIQUE (conversation_id, client_message_id)
```

Flow:

1. Client generates UUID `clientMessageId`, shows optimistic bubble (`SENDING`).
2. `INSERT ... ON CONFLICT (conversation_id, client_message_id) DO NOTHING RETURNING *`  
   (or select existing on conflict).
3. Retry / double-submit returns the **same** message id → UI replaces optimistic id.
4. Failed sends: `status = FAILED`; retry reuses same `clientMessageId`.

---

## 10. Database transactions (required units of work)

| Use case | TX steps |
|----------|----------|
| **Send message** | insert message → update conversation denorm → bump member unread → audit → (optional) notifications |
| **Mark read** | upsert reads → reset member unread/watermark → maybe promote message status |
| **Create group** | insert conversation → insert members (1 OWNER) → seed group_roles → audit |
| **Add members** | insert members → system message → notifications → audit |
| **Transfer ownership** | demote old owner → promote new → audit (`OWNERSHIP_TRANSFER`) |
| **Soft-delete message** | set `deleted_at` → if was lastMessage, recompute denorm → unpin/stars optional → audit |
| **Login** | create session (+ refresh) → audit `USER_LOGIN` |

Prefer **short** transactions; push WS fan-out **after** commit (outbox later).

---

## 11. Index strategy

### Hot path

| Index | Supports |
|-------|----------|
| `messages (conversation_id, created_at DESC, id DESC)` | Cursor pages |
| `messages (conversation_id, client_message_id)` UNIQUE | Idempotent send |
| `conversation_members (user_id, …)` | Inbox membership |
| `conversations (last_message_at DESC)` | Inbox sort |
| `message_reads (message_id, user_id)` UNIQUE | Receipt upsert |
| `sessions (session_token_hash)` UNIQUE | Cookie auth |

### Warm path

| Index | Supports |
|-------|----------|
| `starred_messages (user_id, created_at DESC)` | Starred panel |
| `pinned_messages (conversation_id, position)` | Pin banner |
| `notifications (user_id, status, created_at DESC)` | Bell |
| `audit_logs (entity_type, entity_id, created_at DESC)` | Forensics |
| `attachments (message_id)` | Media render |

### Partial (see §3)

Active owner, active members, non-deleted message cursor, unrevoked sessions.

---

## 12. Performance notes

1. **Denormalize inbox** (`last_message_*`, `unread_count`) — never `COUNT(*)` messages for list screens.
2. **Keep message rows narrow** — heavy media in `attachments` + object storage.
3. **Soft delete** messages; redact `content` in place if compliance requires (optional job).
4. **Partitioning candidates (later):** `messages`, `message_reads`, `audit_logs` by time or hash of `conversation_id`.
5. **Avoid unbounded reads:** always `LIMIT` + cursor; default 30 (frontend).
6. **Stars are per-user** — do not add `starred boolean` on `messages` (that doesn’t scale across users).
7. **Pins are per-conversation** — `pinned_messages` table allows ordering + multi-pin.
8. **Connection pooling:** PgBouncer transaction mode; Prisma needs careful prepared-statement settings in serverless.
9. **Hot conversation writes:** unread counter updates are `N-1` row updates; for mega-groups (>5k) switch to async unread via Redis then flush (see scaling).

---

## 13. Migration plan

### Phase 0 — Bootstrap (now)

1. Use current `prisma/schema.prisma`.
2. Apply the **official** migration only:
   `npx prisma migrate dev` (or `migrate deploy` in CI/prod)
   → `prisma/migrations/20260714120000_init_chat_platform/migration.sql`
3. That migration includes **all** production-critical partial uniques, CHECKs, and composite FKs.  
   Do **not** apply `prisma/sql/partial_indexes.sql` (deprecated pointer).
4. `npx prisma generate`.
5. Confirm DB/role `timezone = UTC` (ops).
6. Seed (later): optional; no business seed required for architecture.

### Phase 1 — Auth tables live

- Migrate `users`, `sessions`, `refresh_tokens` first if auth ships before chat.

### Phase 2 — Conversations + members

- Enable DIRECT `direct_pair_key` enforcement in app TX.
- Partial unique owner index.

### Phase 3 — Messages + reads + pins/stars

- Heaviest write path; verify EXPLAIN on cursor query before load tests.

### Phase 4 — Notifications + audit

- Audit can be async (queue) if insert latency matters; keep sync for security events.

### Phase 5 — Attachments

- Add bucket lifecycle / antivirus hooks outside DB.

### Rollback

- Forward-only for message partitions; prefer expand/contract for column changes.
- Never hard-delete `audit_logs` in app migrations.

---

## 14. Future scaling strategy

| Horizon | Approach |
|---------|----------|
| **~10M messages** | Single Postgres primary + read replica for inbox/history; PgBouncer |
| **Hot groups** | Redis for presence, typing, unread deltas; periodic DB reconcile |
| **~100M+ messages** | Range-partition `messages` monthly; partition `message_reads` by message month or conversation hash |
| **Multi-region** | Conversation-affinity routing; avoid cross-region strong consistency on receipts |
| **Search** | OpenSearch/Elastic on async indexer — not `LIKE` on `messages.content` |
| **Media** | CDN + S3; DB holds `attachments` metadata only |
| **WebSocket** | Pub/sub (Redis) keyed by `conversationId` / `userId`; DB remains source of truth after commit |
| **Outbox** | `outbox_events` table (future) for reliable WS/push after TX commit |
| **Sharding** | Shard by `conversation_id` hash when a single primary saturates write IOPS |

---

## 15. Architecture exception reminders

- **Authorization** is enforced in services later; schema enables it via `MemberRole` + membership uniqueness.
- **GroupRole** catalog supports future custom roles without breaking the OWNER/ADMIN/MEMBER enum used by the frontend today.
- **FutureAttachment** is intentionally named/ready; no upload API in this phase.

---

## 16. Validation checklist (DB design)

- [x] All requested entities present  
- [x] MessageType aligned with frontend  
- [x] Notification.messageId → Message FK (`ON DELETE SET NULL`)  
- [x] DIRECT requires `directPairKey` (CHECK in **official migration**)  
- [x] Active-only unique `directPairKey` (partial — soft-deleted DMs recreatable)  
- [x] Active-only unique email (partial)  
- [x] Active membership unique (partial) — leave/rejoin lifecycle documented  
- [x] Pin/attachment conversation consistency via composite FK  
- [x] Users soft-delete only (hard delete unsupported)  
- [x] Production integrity in Prisma migration (not sidecar-only)  
- [x] UTC policy documented  
- [x] No API / business logic in this phase  

## 17. Schema refinement log

| Change | Detail |
|--------|--------|
| Notification.messageId | Nullable FK → `messages.id`, `ON DELETE SET NULL` |
| MessageType | `TEXT`, `IMAGE`, `DOCUMENT`, `LINK`, `SYSTEM` |
| DIRECT CHECK | In official migration |
| Email unique | Partial `WHERE deletedAt IS NULL` |
| directPairKey | Partial unique on active conversations only |
| Membership | Partial unique on active rows; rejoin = INSERT |
| Pins / attachments | Composite FK `(messageId, conversationId)` → `messages` |
| Sidecar SQL | Deprecated; integrity moved into Prisma migration |
| User delete policy | Soft-delete only |
