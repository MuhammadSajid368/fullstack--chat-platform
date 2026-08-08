import { z } from "zod";

export const UPLOAD_FILENAME_MAX = 255;
export const UPLOAD_CHECKSUM_MAX = 128;
export const UPLOAD_REASON_MAX = 500;

/** Size limits (bytes). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_STICKER_BYTES = 1 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_VOICE_BYTES = 16 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const uploadTypeSchema = z.enum([
  "image",
  "document",
  "voice",
  "video",
  "sticker",
]);

export const attachmentIdParamsSchema = z.object({
  attachmentId: z.string().min(1),
});

export const createUploadBodySchema = z
  .object({
    type: uploadTypeSchema,
    mimeType: z.string().min(3).max(128),
    fileName: z
      .string()
      .min(1)
      .max(UPLOAD_FILENAME_MAX)
      .transform((v) => v.trim()),
    byteSize: z.coerce.number().int().min(0).max(MAX_VIDEO_BYTES),
    checksum: z.string().min(1).max(UPLOAD_CHECKSUM_MAX).nullable().optional(),
    conversationId: z.string().min(1).nullable().optional(),
    width: z.coerce.number().int().positive().nullable().optional(),
    height: z.coerce.number().int().positive().nullable().optional(),
    durationMs: z.coerce.number().int().positive().nullable().optional(),
  })
  .superRefine((body, ctx) => {
    const mime = body.mimeType.toLowerCase();
    switch (body.type) {
      case "image":
      case "sticker":
        if (!mime.startsWith("image/")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${body.type.toUpperCase()} requires an image/* mime type`,
            path: ["mimeType"],
          });
        }
        if (
          body.byteSize >
          (body.type === "sticker" ? MAX_STICKER_BYTES : MAX_IMAGE_BYTES)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "File size exceeds limit for type",
            path: ["byteSize"],
          });
        }
        break;
      case "document":
        if (
          mime.startsWith("image/") ||
          mime.startsWith("audio/") ||
          mime.startsWith("video/")
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "DOCUMENT cannot use image/audio/video mime types",
            path: ["mimeType"],
          });
        }
        if (body.byteSize > MAX_DOCUMENT_BYTES) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "File size exceeds document limit",
            path: ["byteSize"],
          });
        }
        break;
      case "voice":
        if (!mime.startsWith("audio/")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "VOICE requires an audio/* mime type",
            path: ["mimeType"],
          });
        }
        if (body.byteSize > MAX_VOICE_BYTES) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "File size exceeds voice limit",
            path: ["byteSize"],
          });
        }
        break;
      case "video":
        if (!mime.startsWith("video/")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "VIDEO requires a video/* mime type",
            path: ["mimeType"],
          });
        }
        if (body.byteSize > MAX_VIDEO_BYTES) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "File size exceeds video limit",
            path: ["byteSize"],
          });
        }
        break;
      default:
        break;
    }

    if (!body.fileName || body.fileName.includes("/") || body.fileName.includes("\\")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "fileName must be a plain filename",
        path: ["fileName"],
      });
    }
  });

export const completeUploadBodySchema = z.object({
  checksum: z.string().min(1).max(UPLOAD_CHECKSUM_MAX).nullable().optional(),
  byteSize: z.coerce.number().int().positive().max(MAX_VIDEO_BYTES).optional(),
  width: z.coerce.number().int().positive().nullable().optional(),
  height: z.coerce.number().int().positive().nullable().optional(),
  durationMs: z.coerce.number().int().positive().nullable().optional(),
});

export const failUploadBodySchema = z.object({
  reason: z.string().max(UPLOAD_REASON_MAX).nullable().optional(),
});

export type AttachmentIdParams = z.infer<typeof attachmentIdParamsSchema>;
export type CreateUploadBody = z.infer<typeof createUploadBodySchema>;
export type CompleteUploadBody = z.infer<typeof completeUploadBodySchema>;
export type FailUploadBody = z.infer<typeof failUploadBodySchema>;
