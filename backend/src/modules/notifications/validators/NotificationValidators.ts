import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const notificationIdParamsSchema = z.object({
  notificationId: z.string().min(1, "notificationId is required"),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;

export function encodeNotificationCursor(
  createdAt: Date,
  id: string
): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
    "utf8"
  ).toString("base64url");
}

export function decodeNotificationCursor(cursor: string): {
  createdAt: Date;
  id: string;
} {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as { createdAt?: string; id?: string };
    if (!raw.createdAt || !raw.id) {
      throw new Error("invalid");
    }
    return { createdAt: new Date(raw.createdAt), id: raw.id };
  } catch {
    throw new Error("Invalid cursor");
  }
}
