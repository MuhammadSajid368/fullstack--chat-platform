# Frontend ↔ Backend Feature Alignment Audit

**Date:** 2026-07-18  
**Backend:** source of truth (not modified)  
**Frontend mode:** `VITE_CHAT_SERVICE_MODE=mock|rest`

## Critical blocker

| Backend capability | Frontend status | Impact | Recommended UI / fix |
|--------------------|-----------------|--------|----------------------|
| Domain APIs require `Authorization: Bearer`; auth cookies are HttpOnly + `Path=/api/auth` | REST client uses cookies only; no Bearer handoff | Browser REST calls to conversations/messages/etc. fail with 401 | Vite/dev + same-origin proxy: rewrite cookie `Path` to `/` and inject `Authorization` from access cookie for `/api/*` and `/socket.io` |

## Gap matrix

| Area | Backend | Frontend before | Impact | Recommended UI |
|------|---------|-----------------|--------|----------------|
| Auth login/logout/me | ✓ | ✓ (REST) | — | Keep |
| Auth register | ✓ | UI stub, no API | Users cannot sign up | Wire Register form → `POST /auth/register` |
| Auth refresh | ✓ | Missing | Sessions expire without silent refresh | Call `POST /auth/refresh` on 401 before logout |
| Users list/search | ✓ | Missing | Cannot pick peers for DM/groups beyond inbox users | Directory in Start Chat / Create Group |
| Users profile PATCH | ✓ | Profile form console.log | Cannot edit profile | Wire Profile → `PATCH /users/me` |
| Conversations inbox/mute/read | ✓ | Partial; mute local-only | Mute not persisted | Wire mute toggle |
| DM create | `POST /messages/direct` | Missing | Cannot start new chats | Start conversation dialog |
| Messages text/image/doc/link | ✓ | ✓ | — | Keep |
| Messages voice/video/sticker/contact/location/system | ✓ | Not typed/rendered | Content invisible or wrong | Extend types + MessageType renderers |
| Message retry endpoint | ✓ | Re-sends via send | Diverges from contract | Prefer `POST /messages/:id/retry` |
| Groups create/members/leave | ✓ | ✓ (mock); REST partial | — | Keep + min 2 members |
| Groups transfer ownership | ✓ | Mock only; REST throws | Owner leave broken in REST | Wire `POST /groups/:id/transfer-ownership` |
| Groups update/delete/role | ✓ | Missing | Cannot manage group | Contact panel actions |
| Uploads | ✓ | Toast placeholders | No media send | Upload pipeline + progress |
| Presence HTTP + WS | ✓ | Mock map only | No live online/last seen | Presence settings + socket |
| Typing | ✓ WS | Missing | No typing indicators | Emit/listen typing events |
| Notifications | ✓ | Settings stub | No alerts | Notification center + badge |
| Search | ✓ | Local name filter | Cannot find messages/users | Search page (messages/users/groups/conversations) |
| Admin | ✓ | Missing | Admins cannot moderate | `/admin` dashboard (role-gated) |
| Socket.IO | ✓ | Stub / no package | No realtime | Full socket client + listeners |
| Calls | N/A backend | Faker UI | Cosmetic only | Leave as non-API shell (no invent) |
| BullMQ / metrics | Ops only | N/A | No end-user UI | Skip |

## Implementation status (2026-07-18)

Implemented on frontend without backend changes:

- Vite proxy Bearer/cookie bridge (port 5173)
- Full REST service layer for users, presence, notifications, search, uploads, admin
- Socket.IO client + `useRealtimeSync`
- Auth register + refresh-before-expire
- Notifications / Search / Admin pages + nav
- Profile PATCH, presence settings, mute wiring
- Group update/delete/role change, create min 2 members
- Message type renderers (voice/video/sticker/contact/location/system)
- Upload+send from Footer + typing indicators
- Start DM via search users

Remaining intentional gaps:

- Password reset flows (no backend routes)
- Calls page (no backend)
- Social login buttons (decorative)
- Binary storage PUT (backend metadata-only uploads)
- Message reactions (backend stub only)
