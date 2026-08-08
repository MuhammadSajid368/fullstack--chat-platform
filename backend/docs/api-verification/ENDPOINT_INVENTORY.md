# Endpoint Inventory

> Generated from registered Express routes in `src/routes/index.ts`, `src/app.ts`, and module route factories.  
> Default `API_PREFIX=/api`. Auth cookies path = `/api/auth` only.  
> Domain routes require `Authorization: Bearer <access JWT>` (cookie is **not** sent outside `/api/auth`).

**Common error body:** `{ "error": { "code": string, "message": string, "fieldErrors"?: object, "retryable"?: boolean } }`  
**Common auth errors:** `401 UNAUTHORIZED`, `403 FORBIDDEN`, `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 CONFLICT`, `429` rate limit, `500`.

Legend: Auth = none | bearer | bearer+admin

---

## Health & Observability (root, unauthenticated)

| Method | Path | Auth | Query | Request | Response | Status |
|--------|------|------|-------|---------|----------|--------|
| GET | `/health` | none | — | — | liveness payload | 200 |
| GET | `/ready` | none | — | — | readiness | 200 / 503 |
| GET | `/health/queues` | none | — | — | queue health | 200 / 503 |
| GET | `/health/live` | none | — | — | obs liveness | 200 |
| GET | `/health/ready` | none | — | — | obs readiness | 200 / 503 |
| GET | `/health/startup` | none | — | — | obs startup | 200 / 503 |
| GET | `/metrics` | none | — | — | Prometheus text | 200 (if `METRICS_ENABLED`) |

---

## Authentication — `/api/auth`

| Method | Path | Auth | Request DTO | Response DTO | Status | Notes |
|--------|------|------|-------------|--------------|--------|-------|
| POST | `/api/auth/login` | none (+ login RL) | `{ email, password }` | `{ user }` + Set-Cookie | 200 | Cookies: `chat_session`, `chat_session_access` |
| GET | `/api/auth/me` | cookie and/or Bearer | — | `{ user }` | 200 | |
| POST | `/api/auth/refresh` | refresh cookie | — | `{ user }` + Set-Cookie | 200 | Rotates refresh family |
| POST | `/api/auth/logout` | cookie and/or Bearer | — | empty | 204 | Idempotent cookie clear |

**Pagination:** none.

---

## Users — `/api/users` (bearer)

| Method | Path | Query | Request | Response | Status | Cursor |
|--------|------|-------|---------|----------|--------|--------|
| GET | `/api/users` | `cursor?`, `limit?` (1–100, def 30) | — | `{ users, nextCursor, hasMore }` | 200 | yes |
| GET | `/api/users/search` | `q`, `cursor?`, `limit?` | — | page | 200 | yes |
| PATCH | `/api/users/me` | — | `name?`, `avatarUrl?`, `phone?`, `about?` (≥1) | `{ user }` | 200 | — |
| GET | `/api/users/:id` | — | params `id` | `{ user }` | 200 | — |

---

## Conversations — `/api/conversations` (bearer)

| Method | Path | Request | Response | Status |
|--------|------|---------|----------|--------|
| GET | `/api/conversations` | — | inbox list | 200 |
| GET | `/api/conversations/:conversationId` | params | conversation DTO | 200 |
| PATCH | `/api/conversations/:conversationId/mute` | `{ muted: boolean }` | conversation | 200 |
| POST | `/api/conversations/:conversationId/read` | — | — | 204 |

**Pagination:** list is membership inbox (no cursor query on this route).

---

## Messages (bearer)

| Method | Path | Query / Body | Status | Cursor |
|--------|------|--------------|--------|--------|
| GET | `/api/conversations/:conversationId/messages` | `cursor?`, `limit?` | 200 | yes |
| POST | `/api/conversations/:conversationId/messages` | send body (`clientMessageId` required) | 201 created / 200 idempotent | — |
| POST | `/api/messages/direct` | send body + `peerUserId` | 201/200 `{ conversationId, message }` | — |
| POST | `/api/messages/:messageId/retry` | — | 200 | — |
| DELETE | `/api/messages/:messageId` | — | 200 | — |
| POST | `/api/messages/:messageId/star` | — | 200 | — |
| DELETE | `/api/messages/:messageId/star` | — | 200 | — |
| POST | `/api/messages/:messageId/pin` | — | 200 | — |
| DELETE | `/api/messages/:messageId/pin` | — | 200 | — |

**Send body:** `type?`, `content?`, `replyToMessageId?`, `clientMessageId`, `attachmentIds?`, `linkPreview?`, `metadata?`  
**Types:** `text|image|document|voice|video|link|location|contact|sticker` (`system` rejected).

---

## Groups — `/api/groups` (bearer)

| Method | Path | Request | Status |
|--------|------|---------|--------|
| POST | `/api/groups` | `name`, `description?`, `avatarUrl?`, `memberUserIds?` | 201 |
| GET | `/api/groups/:groupId` | — | 200 |
| PATCH | `/api/groups/:groupId` | `name?`, `description?`, `avatarUrl?` (≥1) | 200 |
| DELETE | `/api/groups/:groupId` | — | 204 |
| POST | `/api/groups/:groupId/members` | `{ memberUserIds: string[1..50] }` | 200 |
| DELETE | `/api/groups/:groupId/members/:userId` | — | 200 |
| PATCH | `/api/groups/:groupId/members/:userId/role` | `{ role: "admin"|"member" }` | 200 |
| POST | `/api/groups/:groupId/leave` | — | 204 |
| POST | `/api/groups/:groupId/transfer-ownership` | `newOwnerUserId` or `toUserId` | 200 |

---

## Presence — `/api/presence` (bearer)

| Method | Path | Request | Status |
|--------|------|---------|--------|
| GET | `/api/presence` | — | 200 self DTO |
| POST | `/api/presence/status` | `{ status: ONLINE\|AWAY\|INVISIBLE }` | 200 |
| POST | `/api/presence/privacy` | `{ privacy: EVERYONE\|CONTACTS\|NOBODY }` | 200 |
| GET | `/api/presence/:userId` | — | 200 privacy-filtered |

Realtime (non-HTTP): `markOnline/Offline`, typing, subscribe — Socket.IO only (by design).

---

## Uploads — `/api/uploads` (bearer)

| Method | Path | Request | Status |
|--------|------|---------|--------|
| POST | `/api/uploads` | `type`, `mimeType`, `fileName`, `byteSize`, … | 201 |
| GET | `/api/uploads/:attachmentId` | — | 200 |
| DELETE | `/api/uploads/:attachmentId` | — | 200 |
| POST | `/api/uploads/:attachmentId/complete` | `checksum?`, `byteSize?`, … | 200 |
| POST | `/api/uploads/:attachmentId/fail` | `reason?` | 200 |

---

## Notifications — `/api/notifications` (bearer)

| Method | Path | Query | Status | Cursor |
|--------|------|-------|--------|--------|
| GET | `/api/notifications` | `cursor?`, `limit?` | 200 | yes |
| GET | `/api/notifications/unread-count` | — | 200 | — |
| PATCH | `/api/notifications/read-all` | — | 200 | — |
| PATCH | `/api/notifications/:notificationId/read` | — | 200 | — |
| DELETE | `/api/notifications/:notificationId` | — | 200 | — |

---

## Search — `/api/search` (bearer)

| Method | Path | Query highlights | Status | Cursor |
|--------|------|------------------|--------|--------|
| GET | `/api/search/messages` | `q`, filters, `sort`, `limit`≤50 | 200 | yes |
| GET | `/api/search/users` | `q`, `sort?`, `limit` | 200 | yes |
| GET | `/api/search/groups` | same | 200 | yes |
| GET | `/api/search/conversations` | same | 200 | yes |

---

## Admin — `/api/admin` (bearer + ADMIN|SUPER_ADMIN)

| Method | Path | Status |
|--------|------|--------|
| GET | `/api/admin/users` | 200 |
| GET | `/api/admin/users/:id` | 200 |
| PATCH | `/api/admin/users/:id/suspend` | 200 |
| PATCH | `/api/admin/users/:id/unsuspend` | 200 |
| DELETE | `/api/admin/users/:id` | 200 |
| POST | `/api/admin/users/:id/restore` | 200 |
| POST | `/api/admin/users/:id/logout-all` | 200 |
| GET | `/api/admin/conversations` | 200 |
| GET | `/api/admin/conversations/:id/members` | 200 |
| DELETE | `/api/admin/conversations/:id` | 200 |
| POST | `/api/admin/conversations/:id/restore` | 200 |
| PATCH | `/api/admin/conversations/:id/archive` | 200 |
| GET | `/api/admin/groups` | 200 |
| DELETE | `/api/admin/groups/:id` | 200 |
| POST | `/api/admin/groups/:id/restore` | 200 |
| POST | `/api/admin/groups/:id/transfer-ownership` | 200 |
| DELETE | `/api/admin/groups/:id/members/:userId` | 200 |
| PATCH | `/api/admin/groups/:id/members/:userId/role` | 200 |
| GET | `/api/admin/messages` | 200 |
| GET | `/api/admin/messages/:id/audit` | 200 |
| DELETE | `/api/admin/messages/:id` | 200 |
| POST | `/api/admin/messages/:id/restore` | 200 |
| GET | `/api/admin/audit` | 200 |
| GET | `/api/admin/reports` | 200 |
| POST | `/api/admin/reports` | 201 |
| PATCH | `/api/admin/reports/:id/review` | 200 |
| PATCH | `/api/admin/reports/:id/resolve` | 200 |
| PATCH | `/api/admin/reports/:id/dismiss` | 200 |

Most mutations accept optional `{ reason }`.

---

## Totals

| Area | Count |
|------|------:|
| Health / metrics | 7 |
| Auth | 4 |
| Users | 4 |
| Conversations | 4 |
| Messages | 9 |
| Groups | 9 |
| Presence | 4 |
| Uploads | 5 |
| Notifications | 5 |
| Search | 4 |
| Admin | 28 |
| **Registered HTTP** | **87** |
| Postman collection requests | **84** (3 probe variants optional; all admin/domain covered) |
