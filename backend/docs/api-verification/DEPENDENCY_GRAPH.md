# Dependency Graph

IDs produced by earlier steps must be reused later. Arrows mean “provides identifiers / session needed by”.

```mermaid
flowchart TD
  H[Health /ready /metrics] --> L[Login]
  L -->|userId accessToken| U[Users]
  L -->|accessToken| P0[Presence self]
  U -->|peerUserId| DM[POST /messages/direct]
  DM -->|conversationId messageId| MSG[Messages in conversation]
  DM -->|conversationId| INBOX[Conversations list/get/mute/read]
  MSG -->|messageId| STAR[Star/Pin/Retry/Delete]
  U -->|peerUserId thirdUserId| GRP[Create Group]
  GRP -->|groupId| GRPM[Members / roles / transfer / leave]
  INBOX -->|conversationId| UP[Uploads create]
  UP -->|attachmentId| UPC[complete / fail / delete]
  UP -->|attachmentId| MSG2[Send message with attachmentIds]
  MSG -->|async jobs| N[Notifications list]
  N -->|notificationId| NR[mark read / delete]
  MSG -->|searchable text| S[Search messages/users/groups/conversations]
  L -->|adminToken| A[Admin moderation]
  DM -->|conversationId messageId userId| A
  GRP -->|groupId| A
  N -.->|created via fan-out| S
  P0 -->|privacy CONTACTS needs DM| DM
```

## ID reuse table

| Variable | Produced by | Consumed by |
|----------|-------------|-------------|
| `accessToken` | Login Set-Cookie `chat_session_access` | All bearer routes |
| `adminToken` | Admin Login cookie extract | `/api/admin/*` |
| `userId` | Login `{ user.id }` | Presence self checks, admin self-avoid |
| `peerUserId` | Seeded second user / Users list | Direct message, group members, presence, reports |
| `thirdUserId` | Seeded third user | Group add/remove member |
| `conversationId` | `POST /messages/direct` or inbox | Messages, mute/read, uploads, search, admin |
| `messageId` | Send message / direct | star/pin/retry/delete, admin message ops |
| `groupId` | `POST /groups` | Group CRUD/members, admin groups |
| `attachmentId` | `POST /uploads` | complete/fail/delete; message `attachmentIds` |
| `notificationId` | `GET /notifications` (after message fan-out) | mark read / delete |
| `reportId` | `POST /admin/reports` | review / resolve / dismiss |
| cursors | list/search responses `nextCursor` | next page requests |

## Critical path (minimum manual setup)

```
Login (user A)
  → Login (user B) elsewhere → set peerUserId
  → POST /messages/direct { peerUserId }
      → conversationId, messageId
  → GET /conversations
  → GET /conversations/:id/messages
  → POST /groups { memberUserIds: [peerUserId] } → groupId
  → POST /uploads → attachmentId → complete
  → GET /notifications (wait/jobs if enabled)
  → GET /search/messages?q=...
  → GET/POST /presence
  → Login admin → adminToken → /api/admin/...
  → GET /health + /ready + /metrics
```
