/**
 * Process-local hook so auth/admin can revoke sockets without importing SocketGateway
 * (avoids container cycles). Bound at gateway start; cleared on close.
 */
export type SocketSessionRevoker = {
  disconnectUser(userId: string): void;
  leaveConversation(userId: string, conversationId: string): void;
};

let revoker: SocketSessionRevoker | null = null;

export function bindSocketSessionRevoker(next: SocketSessionRevoker): void {
  revoker = next;
}

export function unbindSocketSessionRevoker(): void {
  revoker = null;
}

export function disconnectUserSockets(userId: string): void {
  revoker?.disconnectUser(userId);
}

export function leaveUserConversationSockets(
  userId: string,
  conversationId: string
): void {
  revoker?.leaveConversation(userId, conversationId);
}
