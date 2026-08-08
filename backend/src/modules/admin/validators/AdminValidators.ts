import { z } from "zod";
import { ValidationError } from "@common/errors/index.js";

const limitSchema = z.coerce.number().int().min(1).max(100).default(30);

const reasonBody = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const adminListUsersQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  includeDeleted: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return false;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  cursor: z.string().min(1).optional(),
  limit: limitSchema,
});

export const adminUserIdParamsSchema = z.object({
  id: z.string().min(1, "id is required"),
});

export const adminSuspendBodySchema = reasonBody.default({});

export const adminListConversationsQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  type: z.enum(["direct", "group", "DIRECT", "GROUP"]).optional(),
  includeDeleted: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return false;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  cursor: z.string().min(1).optional(),
  limit: limitSchema,
});

export const adminConversationIdParamsSchema = z.object({
  id: z.string().min(1, "id is required"),
});

export const adminListGroupsQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  includeDeleted: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return false;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  cursor: z.string().min(1).optional(),
  limit: limitSchema,
});

export const adminGroupIdParamsSchema = z.object({
  id: z.string().min(1, "id is required"),
});

export const adminTransferOwnershipBodySchema = z.object({
  newOwnerId: z.string().min(1, "newOwnerId is required"),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const adminGroupMemberParamsSchema = z.object({
  id: z.string().min(1, "id is required"),
  userId: z.string().min(1, "userId is required"),
});

export const adminChangeMemberRoleBodySchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const adminListMessagesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  conversationId: z.string().min(1).optional(),
  senderId: z.string().min(1).optional(),
  includeDeleted: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return false;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  cursor: z.string().min(1).optional(),
  limit: limitSchema,
});

export const adminMessageIdParamsSchema = z.object({
  id: z.string().min(1, "id is required"),
});

export const adminListAuditQuerySchema = z.object({
  actorId: z.string().min(1).optional(),
  entityType: z.string().min(1).max(64).optional(),
  entityId: z.string().min(1).max(64).optional(),
  action: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: limitSchema,
});

export const adminListReportsQuerySchema = z.object({
  status: z
    .enum(["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"])
    .optional(),
  cursor: z.string().min(1).optional(),
  limit: limitSchema,
});

export const adminReportIdParamsSchema = z.object({
  id: z.string().min(1, "id is required"),
});

export const adminCreateReportBodySchema = z.object({
  targetType: z.enum(["USER", "MESSAGE", "CONVERSATION", "GROUP"]),
  targetId: z.string().min(1).max(64),
  reason: z.string().trim().min(1).max(200),
  details: z.string().trim().max(2000).optional(),
});

export const adminReviewReportBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const adminResolveReportBodySchema = z.object({
  resolution: z.string().trim().min(1).max(2000),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const adminDismissReportBodySchema = z.object({
  resolution: z.string().trim().max(2000).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});

export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;
export type AdminUserIdParams = z.infer<typeof adminUserIdParamsSchema>;
export type AdminSuspendBody = z.infer<typeof adminSuspendBodySchema>;
export type AdminListConversationsQuery = z.infer<
  typeof adminListConversationsQuerySchema
>;
export type AdminConversationIdParams = z.infer<
  typeof adminConversationIdParamsSchema
>;
export type AdminListGroupsQuery = z.infer<typeof adminListGroupsQuerySchema>;
export type AdminGroupIdParams = z.infer<typeof adminGroupIdParamsSchema>;
export type AdminTransferOwnershipBody = z.infer<
  typeof adminTransferOwnershipBodySchema
>;
export type AdminGroupMemberParams = z.infer<
  typeof adminGroupMemberParamsSchema
>;
export type AdminChangeMemberRoleBody = z.infer<
  typeof adminChangeMemberRoleBodySchema
>;
export type AdminListMessagesQuery = z.infer<typeof adminListMessagesQuerySchema>;
export type AdminMessageIdParams = z.infer<typeof adminMessageIdParamsSchema>;
export type AdminListAuditQuery = z.infer<typeof adminListAuditQuerySchema>;
export type AdminListReportsQuery = z.infer<typeof adminListReportsQuerySchema>;
export type AdminReportIdParams = z.infer<typeof adminReportIdParamsSchema>;
export type AdminCreateReportBody = z.infer<typeof adminCreateReportBodySchema>;
export type AdminResolveReportBody = z.infer<
  typeof adminResolveReportBodySchema
>;
export type AdminDismissReportBody = z.infer<
  typeof adminDismissReportBodySchema
>;

export type AdminCursorPayload = {
  createdAt: string;
  id: string;
};

export function encodeAdminCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
    "utf8"
  ).toString("base64url");
}

export function decodeAdminCursor(cursor: string): AdminCursorPayload {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as AdminCursorPayload;
    if (!raw.createdAt || !raw.id) {
      throw new Error("invalid");
    }
    return raw;
  } catch {
    throw new ValidationError("Invalid cursor", { cursor: "Invalid cursor" });
  }
}
