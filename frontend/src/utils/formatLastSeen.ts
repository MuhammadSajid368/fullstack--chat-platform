/**
 * Human-readable last-seen label for chat headers.
 */
export function formatLastSeen(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return null;
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - at.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "Last seen just now";
  }
  if (diffMs < hour) {
    const mins = Math.floor(diffMs / minute);
    return `Last seen ${mins}m ago`;
  }
  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `Last seen ${hours}h ago`;
  }

  const yesterday = new Date(now);
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  if (at >= yesterday) {
    return `Last seen yesterday ${at.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return `Last seen ${at.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
