import { z } from "zod";

export const GROUP_NAME_MAX = 120;
export const GROUP_DESCRIPTION_MAX = 1000;
export const GROUP_AVATAR_URL_MAX = 2048;
export const GROUP_MAX_MEMBERS = 256;
export const GROUP_ADD_MEMBERS_MAX = 50;

export const groupIdParamsSchema = z.object({
  groupId: z.string().min(1),
});

export const groupMemberParamsSchema = z.object({
  groupId: z.string().min(1),
  userId: z.string().min(1),
});

export const GROUP_MIN_MEMBERS = 2;

export const createGroupBodySchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(1).max(GROUP_NAME_MAX)),
  description: z
    .string()
    .max(GROUP_DESCRIPTION_MAX)
    .nullable()
    .optional()
    .transform((v) => {
      if (v == null) {
        return null;
      }
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, GROUP_DESCRIPTION_MAX);
    }),
  avatarUrl: z
    .union([
      z.string().url().max(GROUP_AVATAR_URL_MAX),
      z.literal("").transform(() => null),
      z.null(),
    ])
    .optional(),
  memberUserIds: z
    .array(z.string().min(1), {
      required_error: "members array is required",
      invalid_type_error: "members must be an array of user IDs",
    })
    .min(GROUP_MIN_MEMBERS, `At least ${GROUP_MIN_MEMBERS} members required`)
    .max(GROUP_ADD_MEMBERS_MAX),
});

export const updateGroupBodySchema = z
  .object({
    name: z
      .string()
      .transform((v) => v.trim().replace(/\s+/g, " "))
      .pipe(z.string().min(1).max(GROUP_NAME_MAX))
      .optional(),
    description: z
      .string()
      .max(GROUP_DESCRIPTION_MAX)
      .nullable()
      .optional()
      .transform((v) => {
        if (v === undefined) {
          return undefined;
        }
        if (v == null) {
          return null;
        }
        const trimmed = v.trim();
        return trimmed.length === 0
          ? null
          : trimmed.slice(0, GROUP_DESCRIPTION_MAX);
      }),
    avatarUrl: z
      .union([
        z.string().url().max(GROUP_AVATAR_URL_MAX),
        z.literal("").transform(() => null),
        z.null(),
      ])
      .optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.description !== undefined ||
      body.avatarUrl !== undefined,
    { message: "At least one field is required" }
  );

export const addMembersBodySchema = z.object({
  memberUserIds: z
    .array(z.string().min(1))
    .min(1)
    .max(GROUP_ADD_MEMBERS_MAX),
});

export const changeMemberRoleBodySchema = z.object({
  role: z.enum(["admin", "member"]),
});

export const transferOwnershipBodySchema = z
  .object({
    newOwnerUserId: z.string().min(1).optional(),
    toUserId: z.string().min(1).optional(),
  })
  .superRefine((body, ctx) => {
    if (!body.newOwnerUserId && !body.toUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "newOwnerUserId is required",
        path: ["newOwnerUserId"],
      });
    }
  });

export type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
export type GroupMemberParams = z.infer<typeof groupMemberParamsSchema>;
export type CreateGroupBody = z.infer<typeof createGroupBodySchema>;
export type UpdateGroupBody = z.infer<typeof updateGroupBodySchema>;
export type AddMembersBody = z.infer<typeof addMembersBodySchema>;
export type ChangeMemberRoleBody = z.infer<typeof changeMemberRoleBodySchema>;
export type TransferOwnershipBody = {
  newOwnerUserId?: string;
  toUserId?: string;
};
