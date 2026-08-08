/**
 * Generates Postman Collection v2.1 + Environment from the audited route inventory.
 * Run: node docs/api-verification/generate-postman.mjs
 * (re-runnable; inventory is the source for this script)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = __dirname;

const authBearer = [
  {
    key: "Authorization",
    value: "Bearer {{accessToken}}",
    type: "text",
  },
];

const authAdmin = [
  {
    key: "Authorization",
    value: "Bearer {{adminToken}}",
    type: "text",
  },
];

function url(pathTemplate) {
  const raw = `{{baseUrl}}${pathTemplate}`;
  const parts = pathTemplate.replace(/^\//, "").split("/").filter(Boolean);
  return {
    raw,
    host: ["{{baseUrl}}"],
    path: parts.map((p) =>
      p.startsWith(":") || (p.startsWith("{{") && p.endsWith("}}"))
        ? p.replace(/^:/, "")
        : p
    ),
  };
}

/** Normalize path like /api/users/{{userId}} */
function req(method, name, pathStr, opts = {}) {
  const {
    headers = [],
    body,
    description = "",
    query = [],
    auth = "bearer",
  } = opts;
  const h = [...headers];
  if (auth === "bearer") h.unshift(...authBearer);
  if (auth === "admin") h.unshift(...authAdmin);
  if (body && !h.some((x) => x.key.toLowerCase() === "content-type")) {
    h.push({ key: "Content-Type", value: "application/json", type: "text" });
  }

  const pathParts = pathStr
    .replace(/^\{\{baseUrl\}\}/, "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);

  const item = {
    name,
    request: {
      method,
      header: h,
      url: {
        raw:
          `{{baseUrl}}/${pathParts.join("/")}` +
          (query.length
            ? "?" + query.map((q) => `${q.key}=${q.value}`).join("&")
            : ""),
        host: ["{{baseUrl}}"],
        path: pathParts,
        query: query.map((q) => ({
          key: q.key,
          value: q.value,
          description: q.description || "",
          disabled: q.disabled || false,
        })),
      },
      description,
    },
    response: [],
  };
  if (body !== undefined) {
    item.request.body = {
      mode: "raw",
      raw: typeof body === "string" ? body : JSON.stringify(body, null, 2),
      options: { raw: { language: "json" } },
    };
  }
  if (opts.event) item.event = opts.event;
  return item;
}

const loginEvents = [
  {
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        "const headers = pm.response.headers.all();",
        "for (const h of headers) {",
        "  if (h.key.toLowerCase() !== 'set-cookie') continue;",
        "  const v = h.value;",
        "  if (v.startsWith('chat_session_access=')) {",
        "    const token = decodeURIComponent(v.split(';')[0].substring('chat_session_access='.length));",
        "    pm.environment.set('accessToken', token);",
        "  } else if (v.startsWith('chat_session=')) {",
        "    const tok = decodeURIComponent(v.split(';')[0].substring('chat_session='.length));",
        "    pm.environment.set('refreshCookie', tok);",
        "  }",
        "}",
        "if (pm.response.code === 200) {",
        "  const j = pm.response.json();",
        "  if (j.user && j.user.id) pm.environment.set('userId', j.user.id);",
        "  if (j.user && j.user.email) pm.environment.set('email', j.user.email);",
        "}",
        "pm.test('Login 200', () => pm.response.to.have.status(200));",
      ],
    },
  },
];

const adminLoginEvents = [
  {
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        "const headers = pm.response.headers.all();",
        "for (const h of headers) {",
        "  if (h.key.toLowerCase() !== 'set-cookie') continue;",
        "  const v = h.value;",
        "  if (v.startsWith('chat_session_access=')) {",
        "    const token = decodeURIComponent(v.split(';')[0].substring('chat_session_access='.length));",
        "    pm.environment.set('adminToken', token);",
        "  }",
        "}",
        "if (pm.response.code === 200) {",
        "  const j = pm.response.json();",
        "  if (j.user && j.user.id) pm.environment.set('adminUserId', j.user.id);",
        "}",
      ],
    },
  },
];

const collection = {
  info: {
    name: "Chat App Backend API",
    description:
      "Complete Postman collection for production verification.\n\n" +
      "IMPORTANT AUTH NOTES:\n" +
      "1. Login sets HttpOnly cookies on path `/api/auth` only.\n" +
      "2. Domain routes (`/api/users`, …) require `Authorization: Bearer {{accessToken}}`.\n" +
      "3. Login test script copies `chat_session_access` cookie value into `accessToken`.\n" +
      "4. Admin folder uses `{{adminToken}}` (login as ADMIN/SUPER_ADMIN user first).\n" +
      "5. Default error shape: `{ error: { code, message, fieldErrors?, retryable? } }`.",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "apiPrefix", value: "/api" },
  ],
  item: [
    {
      name: "00 Health & Observability",
      item: [
        req("GET", "Liveness (/health)", "health", { auth: "none", description: "Process liveness. 200." }),
        req("GET", "Readiness (/ready)", "ready", { auth: "none", description: "Postgres+Redis readiness. 200 or 503." }),
        req("GET", "Queue health (/health/queues)", "health/queues", { auth: "none", description: "BullMQ health. 200 or 503." }),
        req("GET", "Obs liveness (/health/live)", "health/live", { auth: "none" }),
        req("GET", "Obs readiness (/health/ready)", "health/ready", { auth: "none" }),
        req("GET", "Obs startup (/health/startup)", "health/startup", { auth: "none" }),
        req("GET", "Prometheus metrics (/metrics)", "metrics", {
          auth: "none",
          description: "Requires METRICS_ENABLED=true. Prometheus text.",
        }),
      ],
    },
    {
      name: "01 Authentication",
      item: [
        req("POST", "Login", "api/auth/login", {
          auth: "none",
          body: {
            email: "{{email}}",
            password: "{{password}}",
          },
          description:
            "Public (+ login rate limit). Sets chat_session + chat_session_access cookies (path /api/auth). Body: { user }. Extract access cookie → accessToken via test script.",
          event: loginEvents,
        }),
        req("POST", "Login (Admin)", "api/auth/login", {
          auth: "none",
          body: {
            email: "{{adminEmail}}",
            password: "{{adminPassword}}",
          },
          description: "Same as login; stores adminToken for Admin folder.",
          event: adminLoginEvents,
        }),
        req("GET", "Me", "api/auth/me", {
          auth: "bearer",
          description: "Also accepts refresh cookie on /api/auth path. 200 { user }.",
        }),
        req("POST", "Refresh", "api/auth/refresh", {
          auth: "none",
          description:
            "Uses refresh cookie `chat_session` (path /api/auth). Rotates tokens. 200 { user }.",
        }),
        req("POST", "Logout", "api/auth/logout", {
          auth: "bearer",
          description: "Revokes session; clears cookies. 204.",
        }),
      ],
    },
    {
      name: "02 Users",
      item: [
        req("GET", "List users", "api/users", {
          query: [
            { key: "cursor", value: "{{userCursor}}", disabled: true },
            { key: "limit", value: "30" },
          ],
          description: "Cursor pagination. 200 { users, nextCursor, hasMore }.",
        }),
        req("GET", "Search users", "api/users/search", {
          query: [
            { key: "q", value: "{{searchQuery}}" },
            { key: "cursor", value: "", disabled: true },
            { key: "limit", value: "30" },
          ],
        }),
        req("PATCH", "Update my profile", "api/users/me", {
          body: {
            name: "Test User",
            about: "API verification",
          },
          description: "At least one of name|avatarUrl|phone|about. 200 { user }.",
        }),
        req("GET", "Get user by id", "api/users/{{peerUserId}}", {
          description: "200 { user }. 404 if missing.",
        }),
      ],
    },
    {
      name: "03 Conversations",
      item: [
        req("GET", "List inbox", "api/conversations", {
          description: "200 inbox list for current user.",
        }),
        req("GET", "Get conversation", "api/conversations/{{conversationId}}", {}),
        req("PATCH", "Mute conversation", "api/conversations/{{conversationId}}/mute", {
          body: { muted: true },
        }),
        req("POST", "Mark conversation read", "api/conversations/{{conversationId}}/read", {
          description: "204 No Content.",
        }),
      ],
    },
    {
      name: "04 Messages",
      item: [
        req("POST", "Send direct message (creates DM)", "api/messages/direct", {
          body: {
            peerUserId: "{{peerUserId}}",
            type: "text",
            content: "Hello from API verification",
            clientMessageId: "{{$guid}}",
          },
          description:
            "Creates/finds DIRECT conversation. 201/200 { conversationId, message }. Save conversationId + messageId from response.",
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  "if (pm.response.code === 200 || pm.response.code === 201) {",
                  "  const j = pm.response.json();",
                  "  if (j.conversationId) pm.environment.set('conversationId', j.conversationId);",
                  "  if (j.message && j.message.id) pm.environment.set('messageId', j.message.id);",
                  "}",
                ],
              },
            },
          ],
        }),
        req("GET", "List messages", "api/conversations/{{conversationId}}/messages", {
          query: [
            { key: "cursor", value: "", disabled: true },
            { key: "limit", value: "30" },
          ],
        }),
        req("POST", "Send message in conversation", "api/conversations/{{conversationId}}/messages", {
          body: {
            type: "text",
            content: "Follow-up message",
            clientMessageId: "{{$guid}}",
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  "if (pm.response.code === 200 || pm.response.code === 201) {",
                  "  const j = pm.response.json();",
                  "  const msg = j.message || j;",
                  "  if (msg.id) pm.environment.set('messageId', msg.id);",
                  "}",
                ],
              },
            },
          ],
        }),
        req("POST", "Retry message", "api/messages/{{messageId}}/retry", {}),
        req("POST", "Star message", "api/messages/{{messageId}}/star", {}),
        req("DELETE", "Unstar message", "api/messages/{{messageId}}/star", {}),
        req("POST", "Pin message", "api/messages/{{messageId}}/pin", {}),
        req("DELETE", "Unpin message", "api/messages/{{messageId}}/pin", {}),
        req("DELETE", "Soft-delete message", "api/messages/{{messageId}}", {}),
      ],
    },
    {
      name: "05 Groups",
      item: [
        req("POST", "Create group", "api/groups", {
          body: {
            name: "API Verification Group",
            description: "Created by Postman",
            memberUserIds: ["{{peerUserId}}"],
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  "if (pm.response.code === 201) {",
                  "  const j = pm.response.json();",
                  "  const id = j.id || j.groupId || (j.group && j.group.id);",
                  "  if (id) pm.environment.set('groupId', id);",
                  "  if (j.conversationId) pm.environment.set('groupConversationId', j.conversationId);",
                  "}",
                ],
              },
            },
          ],
        }),
        req("GET", "Get group", "api/groups/{{groupId}}", {}),
        req("PATCH", "Update group", "api/groups/{{groupId}}", {
          body: { description: "Updated description" },
        }),
        req("POST", "Add members", "api/groups/{{groupId}}/members", {
          body: { memberUserIds: ["{{thirdUserId}}"] },
        }),
        req("PATCH", "Change member role", "api/groups/{{groupId}}/members/{{peerUserId}}/role", {
          body: { role: "admin" },
        }),
        req("POST", "Transfer ownership", "api/groups/{{groupId}}/transfer-ownership", {
          body: { newOwnerUserId: "{{peerUserId}}" },
        }),
        req("DELETE", "Remove member", "api/groups/{{groupId}}/members/{{thirdUserId}}", {}),
        req("POST", "Leave group", "api/groups/{{groupId}}/leave", {
          description: "204. Use a non-owner session.",
        }),
        req("DELETE", "Delete group", "api/groups/{{groupId}}", {
          description: "204. Owner only.",
        }),
      ],
    },
    {
      name: "06 Uploads",
      item: [
        req("POST", "Create upload", "api/uploads", {
          body: {
            type: "image",
            mimeType: "image/png",
            fileName: "verify.png",
            byteSize: 1024,
            conversationId: "{{conversationId}}",
            checksum: "abc123",
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  "if (pm.response.code === 201) {",
                  "  const j = pm.response.json();",
                  "  const id = j.id || j.attachmentId || (j.attachment && j.attachment.id);",
                  "  if (id) pm.environment.set('attachmentId', id);",
                  "}",
                ],
              },
            },
          ],
        }),
        req("GET", "Get upload", "api/uploads/{{attachmentId}}", {}),
        req("POST", "Complete upload", "api/uploads/{{attachmentId}}/complete", {
          body: { checksum: "abc123", byteSize: 1024 },
        }),
        req("POST", "Fail upload", "api/uploads/{{attachmentId}}/fail", {
          body: { reason: "manual verification fail path" },
        }),
        req("DELETE", "Soft-delete upload", "api/uploads/{{attachmentId}}", {}),
      ],
    },
    {
      name: "07 Presence",
      item: [
        req("GET", "Get my presence", "api/presence", {}),
        req("POST", "Set status", "api/presence/status", {
          body: { status: "AWAY" },
        }),
        req("POST", "Set privacy", "api/presence/privacy", {
          body: { privacy: "CONTACTS" },
        }),
        req("GET", "Get user presence", "api/presence/{{peerUserId}}", {
          description: "Privacy-filtered snapshot for viewer.",
        }),
      ],
    },
    {
      name: "08 Notifications",
      item: [
        req("GET", "List notifications", "api/notifications", {
          query: [
            { key: "cursor", value: "", disabled: true },
            { key: "limit", value: "30" },
          ],
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  "if (pm.response.code === 200) {",
                  "  const j = pm.response.json();",
                  "  const list = j.notifications || [];",
                  "  if (list[0] && list[0].id) pm.environment.set('notificationId', list[0].id);",
                  "}",
                ],
              },
            },
          ],
        }),
        req("GET", "Unread count", "api/notifications/unread-count", {}),
        req("PATCH", "Mark all read", "api/notifications/read-all", {}),
        req("PATCH", "Mark one read", "api/notifications/{{notificationId}}/read", {}),
        req("DELETE", "Soft-delete notification", "api/notifications/{{notificationId}}", {}),
      ],
    },
    {
      name: "09 Search",
      item: [
        req("GET", "Search messages", "api/search/messages", {
          query: [
            { key: "q", value: "{{searchQuery}}" },
            { key: "conversationId", value: "{{conversationId}}", disabled: true },
            { key: "sort", value: "relevance" },
            { key: "limit", value: "20" },
            { key: "cursor", value: "", disabled: true },
          ],
        }),
        req("GET", "Search users", "api/search/users", {
          query: [
            { key: "q", value: "{{searchQuery}}" },
            { key: "limit", value: "20" },
          ],
        }),
        req("GET", "Search groups", "api/search/groups", {
          query: [
            { key: "q", value: "API" },
            { key: "limit", value: "20" },
          ],
        }),
        req("GET", "Search conversations", "api/search/conversations", {
          query: [
            { key: "q", value: "{{searchQuery}}" },
            { key: "limit", value: "20" },
          ],
        }),
      ],
    },
    {
      name: "10 Admin",
      item: [
        req("GET", "List users", "api/admin/users", {
          auth: "admin",
          query: [
            { key: "q", value: "", disabled: true },
            { key: "includeDeleted", value: "false" },
            { key: "limit", value: "30" },
          ],
        }),
        req("GET", "Get user", "api/admin/users/{{peerUserId}}", { auth: "admin" }),
        req("PATCH", "Suspend user", "api/admin/users/{{peerUserId}}/suspend", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("PATCH", "Unsuspend user", "api/admin/users/{{peerUserId}}/unsuspend", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("DELETE", "Soft-delete user", "api/admin/users/{{peerUserId}}", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("POST", "Restore user", "api/admin/users/{{peerUserId}}/restore", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("POST", "Force logout all", "api/admin/users/{{peerUserId}}/logout-all", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("GET", "List conversations", "api/admin/conversations", {
          auth: "admin",
          query: [{ key: "limit", value: "30" }],
        }),
        req("GET", "List conversation members", "api/admin/conversations/{{conversationId}}/members", {
          auth: "admin",
        }),
        req("DELETE", "Soft-delete conversation", "api/admin/conversations/{{conversationId}}", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("POST", "Restore conversation", "api/admin/conversations/{{conversationId}}/restore", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("PATCH", "Archive conversation", "api/admin/conversations/{{conversationId}}/archive", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("GET", "List groups", "api/admin/groups", {
          auth: "admin",
          query: [{ key: "limit", value: "30" }],
        }),
        req("DELETE", "Soft-delete group", "api/admin/groups/{{groupId}}", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("POST", "Restore group", "api/admin/groups/{{groupId}}/restore", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("POST", "Transfer group ownership", "api/admin/groups/{{groupId}}/transfer-ownership", {
          auth: "admin",
          body: { newOwnerId: "{{peerUserId}}", reason: "API verification" },
        }),
        req("DELETE", "Remove group member", "api/admin/groups/{{groupId}}/members/{{thirdUserId}}", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("PATCH", "Change group member role", "api/admin/groups/{{groupId}}/members/{{peerUserId}}/role", {
          auth: "admin",
          body: { role: "ADMIN", reason: "API verification" },
        }),
        req("GET", "List messages", "api/admin/messages", {
          auth: "admin",
          query: [
            { key: "conversationId", value: "{{conversationId}}", disabled: true },
            { key: "limit", value: "30" },
          ],
        }),
        req("GET", "Message audit", "api/admin/messages/{{messageId}}/audit", {
          auth: "admin",
        }),
        req("DELETE", "Soft-delete message", "api/admin/messages/{{messageId}}", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("POST", "Restore message", "api/admin/messages/{{messageId}}/restore", {
          auth: "admin",
          body: { reason: "API verification" },
        }),
        req("GET", "List audit log", "api/admin/audit", {
          auth: "admin",
          query: [{ key: "limit", value: "30" }],
        }),
        req("GET", "List reports", "api/admin/reports", {
          auth: "admin",
          query: [
            { key: "status", value: "OPEN", disabled: true },
            { key: "limit", value: "30" },
          ],
        }),
        req("POST", "Create report", "api/admin/reports", {
          auth: "admin",
          body: {
            targetType: "USER",
            targetId: "{{peerUserId}}",
            reason: "Spam / API verification",
            details: "Created during Postman verification",
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  "if (pm.response.code === 201) {",
                  "  const j = pm.response.json();",
                  "  const id = j.id || (j.report && j.report.id);",
                  "  if (id) pm.environment.set('reportId', id);",
                  "}",
                ],
              },
            },
          ],
        }),
        req("PATCH", "Review report", "api/admin/reports/{{reportId}}/review", {
          auth: "admin",
          body: { reason: "Under review" },
        }),
        req("PATCH", "Resolve report", "api/admin/reports/{{reportId}}/resolve", {
          auth: "admin",
          body: { resolution: "Action taken", reason: "Verified" },
        }),
        req("PATCH", "Dismiss report", "api/admin/reports/{{reportId}}/dismiss", {
          auth: "admin",
          body: { resolution: "No action", reason: "False positive" },
        }),
      ],
    },
  ],
};

const environment = {
  id: "chat-api-local",
  name: "Chat API Local",
  values: [
    { key: "baseUrl", value: "http://127.0.0.1:3000", type: "default", enabled: true },
    { key: "cookieName", value: "chat_session", type: "default", enabled: true },
    { key: "email", value: "user@example.com", type: "default", enabled: true },
    { key: "password", value: "ChangeMe123!", type: "secret", enabled: true },
    { key: "adminEmail", value: "admin@example.com", type: "default", enabled: true },
    { key: "adminPassword", value: "ChangeMe123!", type: "secret", enabled: true },
    { key: "accessToken", value: "", type: "secret", enabled: true },
    { key: "adminToken", value: "", type: "secret", enabled: true },
    { key: "refreshCookie", value: "", type: "secret", enabled: true },
    { key: "userId", value: "", type: "default", enabled: true },
    { key: "adminUserId", value: "", type: "default", enabled: true },
    { key: "peerUserId", value: "", type: "default", enabled: true },
    { key: "thirdUserId", value: "", type: "default", enabled: true },
    { key: "conversationId", value: "", type: "default", enabled: true },
    { key: "groupId", value: "", type: "default", enabled: true },
    { key: "groupConversationId", value: "", type: "default", enabled: true },
    { key: "messageId", value: "", type: "default", enabled: true },
    { key: "attachmentId", value: "", type: "default", enabled: true },
    { key: "notificationId", value: "", type: "default", enabled: true },
    { key: "reportId", value: "", type: "default", enabled: true },
    { key: "userCursor", value: "", type: "default", enabled: true },
    { key: "searchQuery", value: "Hello", type: "default", enabled: true },
  ],
  _postman_variable_scope: "environment",
};

fs.writeFileSync(
  path.join(outDir, "Chat-API.postman_collection.json"),
  JSON.stringify(collection, null, 2)
);
fs.writeFileSync(
  path.join(outDir, "Chat-API.postman_environment.json"),
  JSON.stringify(environment, null, 2)
);

function countItems(items) {
  let n = 0;
  for (const it of items) {
    if (it.item) n += countItems(it.item);
    else n += 1;
  }
  return n;
}

console.log(
  `Wrote collection (${countItems(collection.item)} requests) + environment to ${outDir}`
);
