import { z } from "zod";
import { ValidationError } from "@common/errors/index.js";
import type { SearchSort } from "@modules/search/dto/SearchDto.js";

const sortSchema = z
  .enum(["newest", "oldest", "relevance"])
  .default("relevance");

const limitSchema = z.coerce.number().int().min(1).max(50).default(20);

const qSchema = z
  .string()
  .trim()
  .min(1, "Search query is required")
  .max(200, "Search query is too long");

const messageTypeSchema = z
  .enum([
    "text",
    "link",
    "system",
    "image",
    "document",
    "voice",
    "video",
    "location",
    "contact",
    "sticker",
  ])
  .optional();

const boolQuery = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((v) => {
    if (v === undefined) {
      return undefined;
    }
    if (typeof v === "boolean") {
      return v;
    }
    return v === "true";
  });

export const searchMessagesQuerySchema = z.object({
  q: qSchema,
  conversationId: z.string().min(1).optional(),
  senderId: z.string().min(1).optional(),
  messageType: messageTypeSchema,
  includeSystem: boolQuery,
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  hasAttachments: boolQuery,
  hasLinks: boolQuery,
  sort: sortSchema,
  cursor: z.string().min(1).optional(),
  limit: limitSchema,
});

export const searchDirectoryQuerySchema = z.object({
  q: qSchema,
  sort: sortSchema,
  cursor: z.string().min(1).optional(),
  limit: limitSchema,
});

export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;
export type SearchDirectoryQuery = z.infer<typeof searchDirectoryQuerySchema>;

export type SearchCursorPayload = {
  sort: SearchSort;
  createdAt: string;
  id: string;
  rank?: number;
};

export function encodeSearchCursor(payload: SearchCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeSearchCursor(cursor: string): SearchCursorPayload {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as SearchCursorPayload;
    if (!raw.sort || !raw.createdAt || !raw.id) {
      throw new Error("invalid");
    }
    return raw;
  } catch {
    throw new ValidationError("Invalid cursor", { cursor: "Invalid cursor" });
  }
}

/**
 * Build a prefix-friendly tsquery string from free text (no quotes).
 * Quoted / advanced queries should use websearch_to_tsquery instead.
 */
export function toPrefixTsQuery(raw: string): string | null {
  const cleaned = raw
    .replace(/[':&|!()*<>]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 12);
  if (cleaned.length === 0) {
    return null;
  }
  return cleaned.map((w) => `${w}:*`).join(" & ");
}

export function truncateSearchLog(q: string, max = 100): string {
  return q.length <= max ? q : `${q.slice(0, max)}…`;
}
