/**
 * Centralized REST path helpers.
 * Keep in sync with backend route modules under `/api`.
 */

export const API_ENDPOINTS = {
  auth: {
    login: "/auth/login",
    register: "/auth/register",
    logout: "/auth/logout",
    me: "/auth/me",
    refresh: "/auth/refresh",
  },
  users: {
    list: "/users",
    search: "/users/search",
    me: "/users/me",
    byId: (userId: string) => `/users/${userId}`,
  },
  conversations: {
    list: "/conversations",
    byId: (conversationId: string) => `/conversations/${conversationId}`,
    read: (conversationId: string) => `/conversations/${conversationId}/read`,
    mute: (conversationId: string) => `/conversations/${conversationId}/mute`,
    messages: (conversationId: string) =>
      `/conversations/${conversationId}/messages`,
  },
  messages: {
    direct: "/messages/direct",
    retry: (messageId: string) => `/messages/${messageId}/retry`,
    byId: (messageId: string) => `/messages/${messageId}`,
    star: (messageId: string) => `/messages/${messageId}/star`,
    pin: (messageId: string) => `/messages/${messageId}/pin`,
  },
  groups: {
    create: "/groups",
    byId: (groupId: string) => `/groups/${groupId}`,
    members: (groupId: string) => `/groups/${groupId}/members`,
    member: (groupId: string, userId: string) =>
      `/groups/${groupId}/members/${userId}`,
    memberRole: (groupId: string, userId: string) =>
      `/groups/${groupId}/members/${userId}/role`,
    leave: (groupId: string) => `/groups/${groupId}/leave`,
    transferOwnership: (groupId: string) =>
      `/groups/${groupId}/transfer-ownership`,
  },
  presence: {
    self: "/presence",
    status: "/presence/status",
    privacy: "/presence/privacy",
    byUserId: (userId: string) => `/presence/${userId}`,
  },
  uploads: {
    create: "/uploads",
    byId: (attachmentId: string) => `/uploads/${attachmentId}`,
    complete: (attachmentId: string) => `/uploads/${attachmentId}/complete`,
    fail: (attachmentId: string) => `/uploads/${attachmentId}/fail`,
  },
  notifications: {
    list: "/notifications",
    unreadCount: "/notifications/unread-count",
    readAll: "/notifications/read-all",
    readOne: (notificationId: string) =>
      `/notifications/${notificationId}/read`,
    delete: (notificationId: string) => `/notifications/${notificationId}`,
  },
  search: {
    messages: "/search/messages",
    users: "/search/users",
    groups: "/search/groups",
    conversations: "/search/conversations",
  },
  admin: {
    users: "/admin/users",
    userById: (userId: string) => `/admin/users/${userId}`,
    suspend: (userId: string) => `/admin/users/${userId}/suspend`,
    unsuspend: (userId: string) => `/admin/users/${userId}/unsuspend`,
    deleteUser: (userId: string) => `/admin/users/${userId}`,
    restoreUser: (userId: string) => `/admin/users/${userId}/restore`,
    logoutAll: (userId: string) => `/admin/users/${userId}/logout-all`,
    conversations: "/admin/conversations",
    conversationMembers: (conversationId: string) =>
      `/admin/conversations/${conversationId}/members`,
    deleteConversation: (conversationId: string) =>
      `/admin/conversations/${conversationId}`,
    restoreConversation: (conversationId: string) =>
      `/admin/conversations/${conversationId}/restore`,
    archiveConversation: (conversationId: string) =>
      `/admin/conversations/${conversationId}/archive`,
    groups: "/admin/groups",
    deleteGroup: (groupId: string) => `/admin/groups/${groupId}`,
    restoreGroup: (groupId: string) => `/admin/groups/${groupId}/restore`,
    transferGroupOwnership: (groupId: string) =>
      `/admin/groups/${groupId}/transfer-ownership`,
    removeGroupMember: (groupId: string, userId: string) =>
      `/admin/groups/${groupId}/members/${userId}`,
    changeGroupMemberRole: (groupId: string, userId: string) =>
      `/admin/groups/${groupId}/members/${userId}/role`,
    messages: "/admin/messages",
    messageAudit: (messageId: string) => `/admin/messages/${messageId}/audit`,
    deleteMessage: (messageId: string) => `/admin/messages/${messageId}`,
    restoreMessage: (messageId: string) =>
      `/admin/messages/${messageId}/restore`,
    audit: "/admin/audit",
    reports: "/admin/reports",
    createReport: "/admin/reports",
    reviewReport: (reportId: string) => `/admin/reports/${reportId}/review`,
    resolveReport: (reportId: string) => `/admin/reports/${reportId}/resolve`,
    dismissReport: (reportId: string) => `/admin/reports/${reportId}/dismiss`,
  },
} as const;
