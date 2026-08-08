/**
 * Allow only http(s) absolute URLs for link previews (blocks javascript:, data:, etc.).
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Returns the URL when safe; otherwise null. */
export function sanitizeHttpUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || !isSafeHttpUrl(trimmed)) {
    return null;
  }
  return trimmed;
}
