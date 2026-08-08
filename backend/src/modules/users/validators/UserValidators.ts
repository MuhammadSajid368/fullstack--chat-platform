import { z } from "zod";
import { ValidationError } from "@common/errors/index.js";

const cursorSchema = z.string().min(1).optional();

const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .default(30);

export const listUsersQuerySchema = z.object({
  cursor: cursorSchema,
  limit: limitSchema,
});

export const searchUsersQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required").max(100),
  cursor: cursorSchema,
  limit: limitSchema,
});

export const userIdParamsSchema = z.object({
  id: z.string().min(1, "User id is required"),
});

const optionalNullableString = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === null || value === "") {
        return null;
      }
      return value;
    });

const dataImagePattern =
  /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i;

/**
 * Editable profile fields only. Extra keys (id, email, password, …) are stripped.
 */
export const updateMyProfileBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    avatarUrl: z
      .union([
        z
          .string()
          .trim()
          .max(2_000_000)
          .refine(
            (value) => {
              if (dataImagePattern.test(value)) {
                return true;
              }
              try {
                const parsed = new URL(value);
                return parsed.protocol === "http:" || parsed.protocol === "https:";
              } catch {
                return false;
              }
            },
            {
              message:
                "avatarUrl must be an http(s) URL or base64 data:image",
            }
          ),
        z.literal(""),
        z.null(),
      ])
      .optional()
      .transform((value) => {
        if (value === undefined) {
          return undefined;
        }
        if (value === null || value === "") {
          return null;
        }
        return value;
      }),
    phone: optionalNullableString(32),
    about: optionalNullableString(500),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.avatarUrl !== undefined ||
      body.phone !== undefined ||
      body.about !== undefined,
    { message: "At least one editable field is required" }
  );

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>;
export type UpdateMyProfileBody = z.infer<typeof updateMyProfileBodySchema>;

export function encodeUserCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString(
    "base64url"
  );
}

export function decodeUserCursor(cursor: string): { createdAt: Date; id: string } {
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
