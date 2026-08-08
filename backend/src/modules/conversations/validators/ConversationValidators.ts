import { z } from "zod";

export const conversationIdParamsSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required"),
});

export const muteConversationBodySchema = z.object({
  muted: z.boolean(),
});

export type ConversationIdParams = z.infer<typeof conversationIdParamsSchema>;
export type MuteConversationBody = z.infer<typeof muteConversationBodySchema>;

/** Soft safety cap for inbox fan-out (frontend currently expects full list). */
export const INBOX_SAFETY_LIMIT = 200;
