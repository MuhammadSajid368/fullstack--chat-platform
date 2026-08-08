# API Testing Guide

Manual verification guide for the feature-complete Chat backend.  
**Do not skip Auth cookie → Bearer extraction** or later steps will fail with 401.

## Prerequisites

1. Postgres + Redis running; `.env` from `.env.example`
2. `npx prisma migrate deploy` (includes presence privacy + search FTS)
3. `npm run dev` (default `http://127.0.0.1:3000`)
4. Seed at least:
   - User A (`email` / `password`)
   - User B (`peerUserId`)
   - User C optional (`thirdUserId`) for group member churn
   - Admin user (`ADMIN` or `SUPER_ADMIN`, `adminEmail` / `adminPassword`)
5. Postman: import
   - `Chat-API.postman_collection.json`
   - `Chat-API.postman_environment.json`
6. Set `baseUrl`, credentials, and known IDs for peers

### Auth mechanics (critical)

| Fact | Implication |
|------|-------------|
| Login sets `chat_session` + `chat_session_access` cookies | Path = `/api/auth` only |
| Domain routes use `authenticate` middleware | Needs Bearer access JWT (refresh cookie will not be sent) |
| Login JSON has no `accessToken` field | Postman **Login** test script copies cookie → `accessToken` |

---

## Recommended testing order

```
Health (/ready)
    ↓
Authentication (Login → Me → Refresh)
    ↓
Users (list / search / me / get peer)
    ↓
Direct Conversation (POST /messages/direct)
    ↓
Conversations (inbox / get / mute / read)
    ↓
Messages (list / send / star / pin / retry / delete)
    ↓
Groups (create → members → roles → …)
    ↓
Uploads (create → complete → use in message → fail/delete paths)
    ↓
Presence (self / status / privacy / peer)
    ↓
Notifications (after messages; jobs on)
    ↓
Search (messages + directories)
    ↓
Admin (adminToken)
    ↓
Observability (/metrics)
```

Minimize setup: create DM early so `conversationId` / `messageId` populate searches, uploads, admin, and notifications.

---

## Global error expectations

| Code | When |
|------|------|
| 400 | Zod validation (`error.code = VALIDATION_ERROR`) |
| 401 | Missing/invalid/expired session |
| 403 | Not member / not admin / privacy |
| 404 | Unknown id or soft-hidden |
| 409 | Conflicts (e.g. auth replay) |
| 429 | Rate limit (login / global) |
| 503 | `/ready` or queues unhealthy |

Checklist per request:
- [ ] Status code matches table  
- [ ] JSON shape matches module DTO (or empty for 204)  
- [ ] Env vars updated when response returns new IDs  

---

## 00 — Health & Observability

### GET `/ready`
- **Purpose:** Gate traffic until Postgres + Redis OK  
- **Setup:** DB + Redis up  
- **Expected:** 200 healthy · 503 if dependency down  
- **Errors:** 503  
- **Checklist:** [ ] 200 with both up [ ] 503 if Redis stopped  

### GET `/health` · `/health/live` · `/health/ready` · `/health/startup` · `/health/queues`
- **Purpose:** Liveness / startup / BullMQ  
- **Auth:** none  
- **Checklist:** [ ] live 200 [ ] queues JSON when jobs enabled  

### GET `/metrics`
- **Purpose:** Prometheus scrape  
- **Setup:** `METRICS_ENABLED=true`  
- **Expected:** 200 text exposition  
- **Checklist:** [ ] contains `chat_backend_` metrics  

---

## 01 — Authentication

### POST `/api/auth/login`
- **Purpose:** Establish session  
- **Request:** `{ "email": "{{email}}", "password": "{{password}}" }`  
- **Expected:** 200 `{ user }`; Set-Cookie for refresh + access  
- **Errors:** 401 bad credentials · 429 · 400 validation  
- **Checklist:** [ ] `accessToken` env set [ ] `userId` set [ ] password never logged  

### GET `/api/auth/me`
- **Setup:** Bearer or cookies on `/api/auth`  
- **Expected:** 200 `{ user }`  
- **Errors:** 401  

### POST `/api/auth/refresh`
- **Setup:** refresh cookie present  
- **Expected:** 200 + rotated cookies  
- **Errors:** 401 · family replay revocation  

### POST `/api/auth/logout`
- **Expected:** 204; cookies cleared  
- **Checklist:** [ ] subsequent Me without token → 401  

Also run **Login (Admin)** to populate `adminToken`.

---

## 02 — Users

| Endpoint | Purpose | Setup | Expected | Errors | Checklist |
|----------|---------|-------|----------|--------|-----------|
| GET `/api/users` | Directory page | Bearer | 200 + cursors | 401 | [ ] limit respected [ ] nextCursor null at end |
| GET `/api/users/search?q=` | Search | Bearer + `q` | 200 | 400 if q missing | [ ] set `peerUserId` from a hit if needed |
| PATCH `/api/users/me` | Profile | Bearer + ≥1 field | 200 `{ user }` | 400 empty patch | [ ] name updates |
| GET `/api/users/:id` | Public profile | `peerUserId` | 200 | 404 | [ ] soft-deleted not returned |

---

## 03 — Direct conversation + Conversations

### POST `/api/messages/direct` (do this before Conversations folder)
- **Purpose:** Create/find DM and first message  
- **Request:** `{ peerUserId, type:"text", content:"…", clientMessageId }`  
- **Expected:** 201/200 `{ conversationId, message }`  
- **Errors:** 404 peer · 400 validation · 401  
- **Checklist:** [ ] save `conversationId` [ ] save `messageId` [ ] second call same `clientMessageId` → 200 idempotent  

### GET `/api/conversations`
- **Expected:** inbox includes DM  
- **Checklist:** [ ] conversation visible  

### GET `/api/conversations/:conversationId`
- **Errors:** 404 if not member  

### PATCH `.../mute` `{ muted:true|false }` → 200  
### POST `.../read` → 204  

---

## 04 — Messages

| Endpoint | Expected | Notes |
|----------|----------|-------|
| GET `.../messages` | 200 page | cursor pagination |
| POST `.../messages` | 201/200 | require membership |
| POST `/messages/:id/star` · DELETE unstar | 200 | |
| POST pin · DELETE unpin | 200 | authz: membership |
| POST retry | 200 | failed pipeline messages |
| DELETE message | 200 | sender/admin/owner rules |

**Errors:** 403 non-member · 404 · 400 SYSTEM type / empty text  

**Checklist:** [ ] list shows sends [ ] star toggles [ ] delete soft-hides for viewers  

---

## 05 — Groups

| Step | Endpoint | Expected |
|------|----------|----------|
| Create | POST `/api/groups` | 201 → `groupId` |
| Get / Update | GET/PATCH | 200 |
| Add members | POST `.../members` | 200 |
| Change role | PATCH `.../role` `{ role:"admin" }` | 200 |
| Transfer | POST `.../transfer-ownership` | 200 |
| Remove member | DELETE `.../members/:userId` | 200 |
| Leave | POST `.../leave` (non-owner session) | 204 |
| Delete | DELETE `/api/groups/:id` (owner) | 204 |

**Errors:** 403 insufficient role · 400 validation · 404  

---

## 06 — Uploads

1. POST `/api/uploads` → 201 → `attachmentId`  
2. POST `.../complete` → 200  
3. Optionally send message with `attachmentIds: ["{{attachmentId}}"]`  
4. On alternate id: POST `.../fail`  
5. DELETE soft-delete  

**Errors:** 400 mime/size · 403 · 404  

---

## 07 — Presence

| Endpoint | Expected |
|----------|----------|
| GET `/api/presence` | self status, devices, privacy |
| POST `/status` `{ status:"AWAY" }` | preferredStatus AWAY if online via sockets elsewhere |
| POST `/privacy` `{ privacy:"CONTACTS" }` | peer may see OFFLINE until DM “contact” |
| GET `/api/presence/:userId` | filtered; NOBODY → offline + null lastSeen |

**Realtime (manual outside Postman):** connect Socket.IO with Bearer; `presence.subscribe`, `typing.start`.  

**Errors:** 404 unknown user · 401  

**Checklist:** [ ] CONTACTS hides from strangers [ ] INVISIBLE never shows ONLINE to peers  

---

## 08 — Notifications

- **Setup:** send messages with jobs enabled; wait briefly  
- GET list → set `notificationId`  
- GET unread-count  
- PATCH read / read-all  
- DELETE  

**Errors:** 404 other user’s notification  

**Checklist:** [ ] count decreases after mark read  

---

## 09 — Search

| Endpoint | Query | Checklist |
|----------|-------|-----------|
| `/api/search/messages` | `q`, optional conversationId | [ ] finds prior DM text |
| `/api/search/users` | `q` | [ ] peer appears |
| `/api/search/groups` | `q` | [ ] group name |
| `/api/search/conversations` | `q` | [ ] inbox match |

**Errors:** 400 missing `q` · 403 on conversation filter if not member  

---

## 10 — Admin

Use `Authorization: Bearer {{adminToken}}`.

Smoke order:
1. GET `/api/admin/users` — 200 (403 with user token)  
2. Suspend / unsuspend peer  
3. List conversations / archive / restore path carefully  
4. List messages / audit  
5. POST report → review → resolve or dismiss  
6. Audit log GET  

**Destructive ops last** (soft-delete user/group) on disposable IDs.

**Checklist:** [ ] non-admin → 403 [ ] reason optional bodies accepted [ ] audit rows appear  

---

## Socket verification (supplementary)

Not in REST collection. Use a Socket.IO client:

1. Connect `{{baseUrl}}` path `/socket.io` with `auth: { token: accessToken, deviceType: "browser" }`  
2. Expect join of `user:{userId}`  
3. `conversation:join` `{ conversationId }`  
4. `typing.start` → peer receives `typing.started`  
5. `presence.subscribe` `{ userId: peer }`  

---

## Sign-off template

| Area | Pass? | Notes |
|------|-------|-------|
| Health ready | | |
| Auth + Bearer handoff | | |
| Users | | |
| DM + Conversations | | |
| Messages | | |
| Groups | | |
| Uploads | | |
| Presence HTTP | | |
| Presence Socket | | |
| Notifications | | |
| Search | | |
| Admin | | |
| Metrics | | |

**Verifier:** _______________ **Date:** _______________ **Build/commit:** _______________
