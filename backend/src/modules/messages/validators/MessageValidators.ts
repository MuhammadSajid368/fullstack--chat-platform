import { z } from "zod";
import { ValidationError } from "@common/errors/index.js";
import { isSafeHttpUrl } from "@common/utils/safeHttpUrl.js";

export const MESSAGE_PAGE_DEFAULT = 30;
export const MESSAGE_PAGE_MAX = 100;
export const TEXT_MAX_LENGTH = 4096;

const apiMessageTypeSchema = z.enum([
  "text",
  "image",
  "document",
  "voice",
  "video",
  "link",
  "location",
  "contact",
  "sticker",
  "system",
]);

export const listMessagesQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MESSAGE_PAGE_MAX)
    .default(MESSAGE_PAGE_DEFAULT),
});

export const conversationIdParamsSchema = z.object({
  conversationId: z.string().min(1),
});

export const messageIdParamsSchema = z.object({
  messageId: z.string().min(1),
});

const httpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine(isSafeHttpUrl, { message: "URL must use http or https" });

const linkPreviewSchema = z
  .object({
    title: z.string().max(200),
    url: httpUrlSchema,
    imageUrl: httpUrlSchema,
  })
  .nullable()
  .optional();

export const sendMessageBodySchema = z
  .object({
    type: apiMessageTypeSchema.default("text"),
    content: z.string().max(TEXT_MAX_LENGTH).optional(),
    replyToMessageId: z.string().min(1).nullable().optional(),
    clientMessageId: z.string().min(1).max(64),
    attachmentIds: z.array(z.string().min(1)).max(20).optional(),
    linkPreview: linkPreviewSchema,
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.type === "system") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SYSTEM messages cannot be sent by clients",
        path: ["type"],
      });
    }

    const content = body.content?.trim() ?? "";
    const attachments = body.attachmentIds ?? [];

    switch (body.type) {
      case "text":
        if (!content) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "TEXT messages require non-empty content",
            path: ["content"],
          });
        }
        break;
      case "image":
      case "document":
      case "voice":
      case "video":
      case "sticker":
        if (attachments.length < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${body.type.toUpperCase()} messages require at least one attachment`,
            path: ["attachmentIds"],
          });
        }
        break;
      case "link": {
        const urlCandidate = content || String(body.metadata?.url ?? "");
        try {
          const parsed = new URL(urlCandidate);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error("bad protocol");
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "LINK messages require a valid http(s) URL",
            path: ["content"],
          });
        }
        break;
      }
      case "location": {
        const lat = Number(body.metadata?.lat);
        const lng = Number(body.metadata?.lng);
        if (
          Number.isNaN(lat) ||
          Number.isNaN(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "LOCATION requires metadata.lat and metadata.lng",
            path: ["metadata"],
          });
        }
        break;
      }
      case "contact": {
        const name = String(body.metadata?.name ?? "").trim();
        const phone = body.metadata?.phone;
        const userId = body.metadata?.userId;
        if (!name && !userId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "CONTACT requires metadata.name or metadata.userId",
            path: ["metadata"],
          });
        }
        if (phone != null && typeof phone === "string" && phone.length > 0) {
          if (!/^\+?[1-9]\d{6,14}$/.test(phone)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "CONTACT phone must be E.164-like",
              path: ["metadata", "phone"],
            });
          }
        }
        break;
      }
      default:
        break;
    }
  });

export const sendDirectBodySchema = sendMessageBodySchema.and(
  z.object({
    peerUserId: z.string().min(1),
  })
);

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;
export type SendDirectBody = z.infer<typeof sendDirectBodySchema>;

export function encodeMessageCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString(
    "base64url"
  );
}

export function decodeMessageCursor(cursor: string): {
  createdAt: Date;
  id: string;
} {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [iso, id] = raw.split("|");
    if (!iso || !id) {
      throw new Error("invalid");
    }
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error("invalid date");
    }
    return { createdAt, id };
  } catch {
    throw new ValidationError("Invalid cursor", { cursor: "Invalid cursor" });
  }
}

export function buildPreview(
  type: string,
  content: string | undefined
): string {
  const text = (content ?? "").trim();
  if (text) {
    return text.slice(0, 280);
  }
  switch (type) {
    case "image":
      return "📷 Photo";
    case "document":
      return "📎 Document";
    case "voice":
      return "🎤 Voice message";
    case "video":
      return "🎬 Video";
    case "location":
      return "📍 Location";
    case "contact":
      return "👤 Contact";
    case "sticker":
      return "Sticker";
    case "link":
      return "🔗 Link";
    case "system":
      return "System";
    default:
      return "Message";
  }
}
