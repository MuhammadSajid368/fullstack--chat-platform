/**
 * Dependency injection token registry.
 * Tokens identify bindings in the composition root — never import concretes in controllers.
 */
export const TOKENS = {
  Config: Symbol.for("Config"),
  Logger: Symbol.for("Logger"),
  Prisma: Symbol.for("Prisma"),
  Redis: Symbol.for("Redis"),

  // Auth
  AuthService: Symbol.for("AuthService"),
  AuthRepository: Symbol.for("AuthRepository"),
  AuthController: Symbol.for("AuthController"),

  // Users
  UserService: Symbol.for("UserService"),
  UserRepository: Symbol.for("UserRepository"),
  UserController: Symbol.for("UserController"),

  // Conversations
  ConversationService: Symbol.for("ConversationService"),
  ConversationRepository: Symbol.for("ConversationRepository"),
  ConversationController: Symbol.for("ConversationController"),

  // Messages
  MessageService: Symbol.for("MessageService"),
  MessageRepository: Symbol.for("MessageRepository"),
  MessageController: Symbol.for("MessageController"),

  // Groups
  GroupService: Symbol.for("GroupService"),
  GroupRepository: Symbol.for("GroupRepository"),
  GroupController: Symbol.for("GroupController"),

  // Presence
  PresenceService: Symbol.for("PresenceService"),
  PresenceRepository: Symbol.for("PresenceRepository"),
  PresenceController: Symbol.for("PresenceController"),

  // Uploads
  UploadService: Symbol.for("UploadService"),
  UploadRepository: Symbol.for("UploadRepository"),
  UploadController: Symbol.for("UploadController"),

  // Notifications
  NotificationService: Symbol.for("NotificationService"),
  NotificationRepository: Symbol.for("NotificationRepository"),
  NotificationController: Symbol.for("NotificationController"),

  // Search
  SearchService: Symbol.for("SearchService"),
  SearchRepository: Symbol.for("SearchRepository"),
  SearchController: Symbol.for("SearchController"),

  // Admin & Moderation
  AdminService: Symbol.for("AdminService"),
  AdminRepository: Symbol.for("AdminRepository"),
  AdminController: Symbol.for("AdminController"),

  // Realtime
  EventPublisher: Symbol.for("EventPublisher"),

  // Jobs
  QueueManager: Symbol.for("QueueManager"),
  QueueHealthProvider: Symbol.for("QueueHealthProvider"),

  // Cross-cutting
  HealthService: Symbol.for("HealthService"),

  // Observability
  MetricsRegistry: Symbol.for("MetricsRegistry"),
  HealthMonitor: Symbol.for("HealthMonitor"),
  Tracer: Symbol.for("Tracer"),
  SocketHealthProvider: Symbol.for("SocketHealthProvider"),
} as const;

export type Token = (typeof TOKENS)[keyof typeof TOKENS];
