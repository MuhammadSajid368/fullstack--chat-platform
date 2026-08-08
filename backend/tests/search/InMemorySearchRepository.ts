import type {
  DirectorySearchFilters,
  MessageSearchFilters,
} from "../../src/modules/search/dto/SearchDto.js";
import type {
  ConversationSearchRow,
  GroupSearchRow,
  ISearchRepository,
  MessageSearchRow,
  UserSearchRow,
} from "../../src/modules/search/interfaces/ISearchRepository.js";
import { decodeSearchCursor } from "../../src/modules/search/validators/SearchValidators.js";

type MemMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string;
  createdAt: Date;
  deletedAt: Date | null;
  linkPreview: boolean;
  hasAttachments: boolean;
  conversationDeletedAt: Date | null;
  senderDeletedAt: Date | null;
};

type MemUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  about: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

type MemConversation = {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  memberIds: string[];
};

function matchesQuery(haystack: string, q: string): boolean {
  const h = haystack.toLowerCase();
  const raw = q.trim().toLowerCase();
  // Quoted phrase
  const quoted = raw.match(/"([^"]+)"/);
  if (quoted?.[1]) {
    return h.includes(quoted[1].toLowerCase());
  }
  return raw.split(/\s+/).every((token) => h.includes(token));
}

function applyCursor<T extends { id: string; createdAtDate: Date; rankValue: number | null }>(
  rows: T[],
  sort: string,
  cursor?: string
): T[] {
  if (!cursor) {
    return rows;
  }
  const cur = decodeSearchCursor(cursor);
  const createdAt = new Date(cur.createdAt).getTime();
  return rows.filter((r) => {
    const t = r.createdAtDate.getTime();
    if (sort === "oldest") {
      return t > createdAt || (t === createdAt && r.id > cur.id);
    }
    if (sort === "newest") {
      return t < createdAt || (t === createdAt && r.id < cur.id);
    }
    const rank = r.rankValue ?? 0;
    const curRank = cur.rank ?? 0;
    if (rank < curRank) {
      return true;
    }
    if (rank > curRank) {
      return false;
    }
    return t < createdAt || (t === createdAt && r.id < cur.id);
  });
}

function sortRows<T extends { id: string; createdAtDate: Date; rankValue: number | null }>(
  rows: T[],
  sort: string
): T[] {
  return [...rows].sort((a, b) => {
    if (sort === "oldest") {
      const t = a.createdAtDate.getTime() - b.createdAtDate.getTime();
      return t !== 0 ? t : a.id.localeCompare(b.id);
    }
    if (sort === "newest") {
      const t = b.createdAtDate.getTime() - a.createdAtDate.getTime();
      return t !== 0 ? t : b.id.localeCompare(a.id);
    }
    const ra = a.rankValue ?? 0;
    const rb = b.rankValue ?? 0;
    if (rb !== ra) {
      return rb - ra;
    }
    const t = b.createdAtDate.getTime() - a.createdAtDate.getTime();
    return t !== 0 ? t : b.id.localeCompare(a.id);
  });
}

/**
 * In-memory search repository for unit tests (FTS approximated by substring match).
 */
export class InMemorySearchRepository implements ISearchRepository {
  messages: MemMessage[] = [];
  users: MemUser[] = [];
  conversations: MemConversation[] = [];
  memberships = new Map<string, Set<string>>(); // conversationId -> userIds

  seedMembership(conversationId: string, userId: string): void {
    let set = this.memberships.get(conversationId);
    if (!set) {
      set = new Set();
      this.memberships.set(conversationId, set);
    }
    set.add(userId);
  }

  async isActiveMember(
    userId: string,
    conversationId: string
  ): Promise<boolean> {
    return this.memberships.get(conversationId)?.has(userId) ?? false;
  }

  async searchMessages(
    viewerId: string,
    filters: MessageSearchFilters
  ): Promise<MessageSearchRow[]> {
    const rows = this.messages.filter((m) => {
      if (m.deletedAt || m.conversationDeletedAt || m.senderDeletedAt) {
        return false;
      }
      if (!this.memberships.get(m.conversationId)?.has(viewerId)) {
        return false;
      }
      if (
        filters.conversationId &&
        m.conversationId !== filters.conversationId
      ) {
        return false;
      }
      if (filters.senderId && m.senderId !== filters.senderId) {
        return false;
      }
      if (filters.messageType) {
        if (m.type !== filters.messageType) {
          return false;
        }
      } else if (!filters.includeSystem) {
        if (m.type !== "text" && m.type !== "link") {
          return false;
        }
      } else if (
        m.type !== "text" &&
        m.type !== "link" &&
        m.type !== "system"
      ) {
        return false;
      }
      if (filters.dateFrom && m.createdAt < filters.dateFrom) {
        return false;
      }
      if (filters.dateTo && m.createdAt > filters.dateTo) {
        return false;
      }
      if (filters.hasAttachments && !m.hasAttachments) {
        return false;
      }
      if (filters.hasLinks && !(m.type === "link" || m.linkPreview)) {
        return false;
      }
      return matchesQuery(m.content, filters.q);
    });

    const mapped: MessageSearchRow[] = rows.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      type: m.type,
      content: m.content,
      snippet: m.content.slice(0, 80),
      createdAt: m.createdAt.toISOString(),
      rank: 1,
      createdAtDate: m.createdAt,
      rankValue: 1,
    }));

    const sorted = sortRows(mapped, filters.sort);
    const after = applyCursor(sorted, filters.sort, filters.cursor);
    return after.slice(0, filters.limit + 1);
  }

  async searchUsers(
    _viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<UserSearchRow[]> {
    const mapped: UserSearchRow[] = this.users
      .filter(
        (u) =>
          !u.deletedAt &&
          (matchesQuery(u.name, filters.q) || matchesQuery(u.email, filters.q))
      )
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        about: u.about,
        rank: 1,
        createdAtDate: u.createdAt,
        rankValue: 1,
      }));
    const sorted = sortRows(mapped, filters.sort);
    return applyCursor(sorted, filters.sort, filters.cursor).slice(
      0,
      filters.limit + 1
    );
  }

  async searchGroups(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<GroupSearchRow[]> {
    const mapped: GroupSearchRow[] = this.conversations
      .filter(
        (c) =>
          c.type === "GROUP" &&
          !c.deletedAt &&
          this.memberships.get(c.id)?.has(viewerId) &&
          matchesQuery(c.name ?? "", filters.q)
      )
      .map((c) => ({
        id: c.id,
        name: c.name ?? "Group",
        avatarUrl: c.avatarUrl,
        description: c.description,
        memberCount: c.memberIds.length,
        rank: 1,
        createdAtDate: c.createdAt,
        rankValue: 1,
      }));
    const sorted = sortRows(mapped, filters.sort);
    return applyCursor(sorted, filters.sort, filters.cursor).slice(
      0,
      filters.limit + 1
    );
  }

  async searchConversations(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<ConversationSearchRow[]> {
    const mapped: ConversationSearchRow[] = this.conversations
      .filter((c) => {
        if (c.deletedAt) {
          return false;
        }
        if (!this.memberships.get(c.id)?.has(viewerId)) {
          return false;
        }
        const peer = c.memberIds.find((id) => id !== viewerId);
        const peerUser = this.users.find((u) => u.id === peer);
        const hay = `${c.name ?? ""} ${c.lastMessagePreview ?? ""} ${peerUser?.name ?? ""}`;
        return matchesQuery(hay, filters.q);
      })
      .map((c) => {
        const peer = c.memberIds.find((id) => id !== viewerId);
        const peerUser = this.users.find((u) => u.id === peer);
        const sortAt = c.lastMessageAt ?? c.createdAt;
        return {
          id: c.id,
          type: c.type === "GROUP" ? ("group" as const) : ("direct" as const),
          name:
            c.type === "GROUP"
              ? (c.name ?? "Group")
              : (peerUser?.name ?? "Direct chat"),
          avatarUrl: c.avatarUrl,
          lastMessagePreview: c.lastMessagePreview,
          lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
          rank: 1,
          createdAtDate: sortAt,
          rankValue: 1,
        };
      });
    const sorted = sortRows(mapped, filters.sort);
    return applyCursor(sorted, filters.sort, filters.cursor).slice(
      0,
      filters.limit + 1
    );
  }
}
