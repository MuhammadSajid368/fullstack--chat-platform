import { z } from "zod";

export const presenceUserIdParamsSchema = z.object({
  userId: z.string().min(1).max(64),
});

export type PresenceUserIdParams = z.infer<typeof presenceUserIdParamsSchema>;

export const updatePresenceStatusBodySchema = z.object({
  status: z.enum(["ONLINE", "AWAY", "INVISIBLE"]),
});

export type UpdatePresenceStatusBody = z.infer<
  typeof updatePresenceStatusBodySchema
>;

export const updatePresencePrivacyBodySchema = z.object({
  privacy: z.enum(["EVERYONE", "CONTACTS", "NOBODY"]),
});

export type UpdatePresencePrivacyBody = z.infer<
  typeof updatePresencePrivacyBodySchema
>;

export const presenceSubscribePayloadSchema = z.object({
  userId: z.string().min(1).max(64),
});

export type PresenceSubscribePayload = z.infer<
  typeof presenceSubscribePayloadSchema
>;

export const typingPayloadSchema = z.object({
  conversationId: z.string().min(1).max(64),
});

export type TypingPayload = z.infer<typeof typingPayloadSchema>;

export const deviceTypeSchema = z
  .enum(["phone", "tablet", "desktop", "browser"])
  .default("browser");
