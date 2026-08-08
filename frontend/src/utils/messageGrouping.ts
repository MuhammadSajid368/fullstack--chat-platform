import type { Message } from "../types/chat";
import { formatDateSeparator, isSameDay } from "./formatMessageTime";

export type MessageListItem =
  | { kind: "divider"; id: string; label: string }
  | { kind: "message"; message: Message };

export function groupMessagesWithDividers(
  messages: Message[]
): MessageListItem[] {
  const items: MessageListItem[] = [];
  let previousDate: string | null = null;

  for (const message of messages) {
    if (!previousDate || !isSameDay(previousDate, message.createdAt)) {
      items.push({
        kind: "divider",
        id: `divider-${message.createdAt}`,
        label: formatDateSeparator(message.createdAt),
      });
      previousDate = message.createdAt;
    }

    items.push({ kind: "message", message });
  }

  return items;
}
