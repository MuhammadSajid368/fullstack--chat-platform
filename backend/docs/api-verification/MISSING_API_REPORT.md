# Missing API Report

Cross-check of **implemented backend modules only** (no speculative features).  
Statuses: ✓ implemented · ⚠ partial / gap · ❌ missing (should exist for feature-complete claim) · ○ by design

---

## Verdict summary

| Module | HTTP surface | Layer wiring | Tests | Gaps |
|--------|--------------|--------------|-------|------|
| Authentication | ✓ | ✓ | ✓ | ⚠ token handoff for Bearer (see below) |
| Users | ✓ | ✓ | ✓ | — |
| Conversations | ✓ | ✓ | ✓ | ○ no create-DM HTTP (via messages/direct) |
| Messages | ✓ | ✓ | ✓ | — |
| Groups | ✓ | ✓ | ✓ | — |
| Uploads | ✓ | ✓ | ✓ | ○ binary upload is metadata-only API |
| Presence | ✓ HTTP + ✓ WS | ✓ | ✓ | ○ realtime methods have no HTTP (by design) |
| Notifications | ✓ | ✓ | ✓ | ○ `processJob` worker-only |
| Search | ✓ | ✓ | ✓ | — |
| Admin | ✓ | ✓ | ⚠ partial HTTP tests | see Admin coverage |
| Health | ✓ | ✓ | ⚠ | `/health` `/ready` `/health/queues` thin HTTP coverage |
| Observability | ✓ metrics | ✓ | ✓ | ○ metrics gated by flag |

**No feature module is missing its registered route factory or DI registration.**

---

## Layer consistency (routes ↔ controllers ↔ services ↔ repos ↔ DI)

| Check | Result |
|-------|--------|
| All mounts in `createApiRouter` resolve controllers from DI | ✓ |
| Presence routes now authenticated | ✓ |
| Interface methods without concrete service (HTTP modules) | ✓ none |
| Service HTTP methods without routes | ✓ none (Presence/ Notification extras are non-HTTP by design) |
| Validator schema unused by any Express route | ⚠ `adminReviewReportBodySchema` defined but review route uses `adminSuspendBodySchema` (same shape: optional `reason`) |
| Presence socket validators (`presenceSubscribePayloadSchema`, `typingPayloadSchema`) | ○ used for WS contracts, not Express |
| Mapper present per module | ✓ |
| Repository Prisma ownership | ✓ |

---

## Missing / partial findings (actionable)

### ⚠ 1. Access token not in login JSON (client / Postman friction)

| Item | Detail |
|------|--------|
| Observation | `POST /api/auth/login` returns `{ user }` only. Access JWT is set as HttpOnly cookie `chat_session_access` with **path `/api/auth`**. |
| Impact | Browser will **not** send that cookie to `/api/users`, etc. Authenticate middleware expects Bearer and/or refresh cookie — but refresh cookie is also path-scoped to `/api/auth`. |
| Reachability | Domain APIs are reachable with `Authorization: Bearer <jwt>` (tests do this). |
| Gap | SPA cannot read HttpOnly cookie. If the frontend has no alternate token delivery, **domain APIs are unreachable from browser JS** without another channel. |
| Manual verify | Postman test script copies Set-Cookie into `accessToken`. Confirm product clients do the equivalent. |
| Classification | ⚠ Client handoff / contract risk — **not** a missing route |

### ⚠ 2. Admin HTTP test coverage incomplete

Registered admin routes: **28**. Automated HTTP tests cover a subset (list users, suspend, audit, conversation archive/delete/restore, list messages, create/dismiss report).  

Missing automated HTTP coverage (service unit tests may still exist):

- GET user, unsuspend, soft-delete/restore user, force logout-all  
- List conversations, list members  
- Most group admin endpoints  
- Message delete/restore/audit  
- List reports, review, resolve  

Classification: ⚠ test gap, not missing API.

### ⚠ 3. Health probe HTTP coverage thin

| Path | Unit/service tests | Full-app HTTP test |
|------|--------------------|--------------------|
| `/health/live|ready|startup` | ✓ obs | ✓ |
| `/health`, `/ready`, `/health/queues` | ✓ HealthService / jobs | ⚠ mostly path-skip / unit only |

Classification: ⚠ test gap.

### ○ 4. Not implemented by design (do not treat as missing HTTP)

| Item | Why |
|------|-----|
| `POST /conversations` to create DM | Creation is `POST /api/messages/direct` |
| Presence `markOnline` / typing HTTP | Socket.IO + Redis |
| Notification create HTTP | Job/worker fan-out (`processJob`) |
| `message:reaction` socket | Stub logged “API phase pending” — realtime stub only |
| Multipart file PUT | Upload API is metadata + complete/fail; storage binary out of band |
| Public registration / password reset | Not in implemented auth module |

### ❌ 5. Nothing classified as “registered route missing controller”

All 87 registered HTTP endpoints map to controller → service methods.

### ❌ 6. Nothing classified as “tested feature with no route”

Automated tests hit reachable HTTP adapters or in-memory service layers. Socket presence/typing are covered under websocket tests.

---

## Ownership / authz / validation / audit spot-checks

| Concern | Status |
|---------|--------|
| Authenticate on all domain modules | ✓ (auth module uses internal token resolve) |
| Admin gate `requireAdmin` | ✓ |
| Conversation membership on message/group ops | ✓ (service layer) |
| Zod validation on mutating routes | ✓ (minor duplicate admin review schema) |
| Audit logs | ✓ on auth/user/admin/message/group flows where repositories write `AuditLog` |
| Presence transactions documented | ✓ `modules/presence/TRANSACTIONS.md` |
| Metrics | ✓ HTTP/auth/socket/presence/queue families |
| Logging PII | ✓ structured; tokens not logged in auth controller |

---

## Socket.IO (not HTTP inventory)

| Incoming | Status |
|----------|--------|
| conversation join/leave | ✓ |
| typing.start/stop | ✓ |
| presence.subscribe/unsubscribe/ping | ✓ |
| message:reaction | ⚠ stub only |

Outgoing events for messages, presence, typing, notifications, uploads: ✓ defined in `RealtimeEvents`.
