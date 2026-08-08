# REST API Contract

This document defines the HTTP API the frontend expects when
`VITE_CHAT_SERVICE_MODE=rest`. Mock mode does not call these endpoints.

DTO shapes live in `src/services/api/apiTypes.ts`. Path helpers live in
`src/services/api/endpoints.ts`. Domain mapping lives in
`src/services/api/transformers.ts`.

## Conventions

- Base URL: `VITE_API_BASE_URL` (example: `http://localhost:3000/api`)
- JSON request/response bodies (`Content-Type: application/json`)
- Timestamps are ISO-8601 UTC strings (or milliseconds; the frontend normalizes)
- Authentication: **HTTP-only session cookie** preferred. No raw access tokens in `localStorage`.
- CORS must allow the Vite origin with `Access-Control-Allow-Credentials: true`.
- Pagination uses **opaque cursors**, never page numbers.
- Frontend group permission checks are UX only; **the backend must enforce roles**.
- Users may only access conversations they belong to.
- Users may only delete their own messages where the backend allows it.

## Error response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "fieldErrors": { "name": "Group name is required" },
    "retryable": false
  }
}
```

Common codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`VALIDATION_ERROR`, `RATE_LIMITED`, `INTERNAL_ERROR`, `NETWORK_ERROR`, `TIMEOUT`.

---

## Authentication

### `POST /auth/login`

Request:

```json
{ "email": "user@example.com", "password": "secret" }
```

Response `200`:

```json
{
  "user": {
    "id": "usr_1",
    "email": "user@example.com",
    "name": "Ada Lovelace",
    "avatarUrl": "https://..."
  }
}
```

Sets session cookie. Do not return raw refresh/access tokens for browser storage.

### `POST /auth/logout`

Clears the session cookie. Response `204` or `200`. Frontend clears local state even if this fails.

### `GET /auth/me`

Response `200`: same `user` object as login. Response `401` when unauthenticated.

---

## Conversations

### `GET /conversations`

Response `200`:

```json
{
  "conversations": [
    {
      "id": "conv_1",
      "type": "direct",
      "name": "Ada",
      "avatarUrl": "",
      "memberIds": ["usr_1", "usr_2"],
      "pinned": false,
      "muted": false,
      "lastMessagePreview": "Hello",
      "lastMessageAt": "2026-07-08T10:00:00.000Z",
      "unreadCount": 2,
      "description": null,
      "members": null,
      "createdBy": null,
      "adminIds": null,
      "inviteCode": null
    }
  ],
  "users": [
    {
      "id": "usr_2",
      "name": "Ada",
      "avatarUrl": "",
      "phone": null,
      "about": null
    }
  ]
}
```

Group conversations include `members` (`[{ "userId", "role" }]`) and group metadata.

### `GET /conversations/:conversationId`

Returns a single conversation DTO (same shape as list item).

### `POST /conversations/:conversationId/read`

Marks conversation as read for the current user. Response `204` or `200`.

### `PATCH /conversations/:conversationId/mute`

Request: `{ "muted": true }`. Response: conversation DTO.

---

## Messages

### `GET /conversations/:conversationId/messages?cursor=&limit=`

- `cursor` — opaque; omit for the newest page
- `limit` — optional, default server-side (frontend default 30)

Response `200`:

```json
{
  "messages": [
    {
      "id": "msg_1",
      "conversationId": "conv_1",
      "senderId": "usr_1",
      "type": "text",
      "content": "Hello",
      "createdAt": "2026-07-08T10:00:00.000Z",
      "status": "sent",
      "starred": false,
      "deleted": false,
      "replyToMessageId": null,
      "imageUrl": null,
      "documentName": null,
      "linkPreview": null,
      "clientMessageId": null
    }
  ],
  "nextCursor": "opaque-cursor-or-null",
  "hasMore": true
}
```

Messages in a page are ordered ascending by `createdAt` (oldest → newest).
Older pages are loaded by passing `nextCursor`.

### `POST /conversations/:conversationId/messages`

Request:

```json
{
  "content": "Hello",
  "replyToMessageId": null,
  "clientMessageId": "client-uuid-idempotency-key"
}
```

Response `201`/`200`: message DTO. Duplicate `clientMessageId` should return the same message (idempotent).

### `POST /messages/:messageId/retry`

Optional dedicated retry endpoint. Frontend may instead resend with the same `clientMessageId`.

### `DELETE /messages/:messageId`

Soft-delete. Response `200` message DTO or `204`.

### `POST /messages/:messageId/star` / `DELETE /messages/:messageId/star`

Toggle star. Response `200`: message DTO.

### `POST /messages/:messageId/pin` / `DELETE /messages/:messageId/pin`

Pin or unpin a message in its conversation. Response `200`: message DTO with `pinned` updated.
Frontend shows pinned messages in a conversation banner.

---

## Groups

### `POST /groups`

Request:

```json
{
  "name": "Dev Team",
  "description": "Engineering",
  "memberUserIds": ["usr_2", "usr_3"]
}
```

Response `201`: conversation DTO (`type: "group"`). Creator is `owner`.

### `POST /groups/:groupId/members`

Request: `{ "memberUserIds": ["usr_4"] }`. Response: conversation DTO.

### `DELETE /groups/:groupId/members/:userId`

Response: conversation DTO.

### `POST /groups/:groupId/leave`

Response `204`. Frontend removes the conversation from local state.

---

## Authorization notes

- Backend enforces conversation membership on every route.
- Backend enforces owner/admin rules for member manage / leave / transfer.
- Frontend `groupPermissions` helpers are UX gating only.
- Do not trust client role claims.

## Out of scope for this phase

- WebSocket events, typing indicators, live presence
- Server-driven delivery/read receipts beyond stored message `status`
- File uploads
- Invite link redemption
