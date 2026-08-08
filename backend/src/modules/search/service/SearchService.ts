import type { Logger } from "pino";
import { NotFoundError } from "@common/errors/index.js";
import type {
  DirectorySearchFilters,
  MessageSearchFilters,
  SearchConversationsPageDto,
  SearchGroupsPageDto,
  SearchMessagesPageDto,
  SearchSort,
  SearchUsersPageDto,
} from "@modules/search/dto/SearchDto.js";
import type { ISearchRepository } from "@modules/search/interfaces/ISearchRepository.js";
import type { ISearchService } from "@modules/search/interfaces/ISearchService.js";
import { SearchMapper } from "@modules/search/mapper/SearchMapper.js";
import {
  encodeSearchCursor,
  truncateSearchLog,
} from "@modules/search/validators/SearchValidators.js";

/**
 * Search service — authz, paging, structured logging (no Prisma).
 */
export class SearchService implements ISearchService {
  constructor(
    protected readonly repository: ISearchRepository,
    protected readonly logger: Logger
  ) {}

  async searchMessages(
    viewerId: string,
    filters: MessageSearchFilters
  ): Promise<SearchMessagesPageDto> {
    const started = Date.now();

    if (filters.conversationId) {
      const ok = await this.repository.isActiveMember(
        viewerId,
        filters.conversationId
      );
      if (!ok) {
        throw new NotFoundError("Conversation not found");
      }
    }

    const rows = await this.repository.searchMessages(viewerId, filters);
    const page = this.page(rows, filters.limit, filters.sort, (r) => ({
      sort: filters.sort,
      createdAt: r.createdAtDate.toISOString(),
      id: r.id,
      rank: r.rankValue ?? undefined,
    }));

    this.log("messages", viewerId, filters.q, started, page.results.length, {
      conversationId: filters.conversationId,
      senderId: filters.senderId,
      messageType: filters.messageType,
      sort: filters.sort,
      hasAttachments: filters.hasAttachments,
      hasLinks: filters.hasLinks,
    });

    return {
      results: page.results.map((r) => SearchMapper.toMessageHit(r)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async searchUsers(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<SearchUsersPageDto> {
    const started = Date.now();
    const rows = await this.repository.searchUsers(viewerId, filters);
    const page = this.page(rows, filters.limit, filters.sort, (r) => ({
      sort: filters.sort,
      createdAt: r.createdAtDate.toISOString(),
      id: r.id,
      rank: r.rankValue ?? undefined,
    }));

    this.log("users", viewerId, filters.q, started, page.results.length, {
      sort: filters.sort,
    });

    return {
      results: page.results.map((r) => SearchMapper.toUserHit(r)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async searchGroups(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<SearchGroupsPageDto> {
    const started = Date.now();
    const rows = await this.repository.searchGroups(viewerId, filters);
    const page = this.page(rows, filters.limit, filters.sort, (r) => ({
      sort: filters.sort,
      createdAt: r.createdAtDate.toISOString(),
      id: r.id,
      rank: r.rankValue ?? undefined,
    }));

    this.log("groups", viewerId, filters.q, started, page.results.length, {
      sort: filters.sort,
    });

    return {
      results: page.results.map((r) => SearchMapper.toGroupHit(r)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async searchConversations(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<SearchConversationsPageDto> {
    const started = Date.now();
    const rows = await this.repository.searchConversations(viewerId, filters);
    const page = this.page(rows, filters.limit, filters.sort, (r) => ({
      sort: filters.sort,
      createdAt: (r.createdAtDate ?? new Date(0)).toISOString(),
      id: r.id,
      rank: r.rankValue ?? undefined,
    }));

    this.log(
      "conversations",
      viewerId,
      filters.q,
      started,
      page.results.length,
      { sort: filters.sort }
    );

    return {
      results: page.results.map((r) => SearchMapper.toConversationHit(r)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  private page<T>(
    rows: T[],
    limit: number,
    _sort: SearchSort,
    toCursor: (row: T) => {
      sort: SearchSort;
      createdAt: string;
      id: string;
      rank?: number;
    }
  ): { results: T[]; nextCursor: string | null; hasMore: boolean } {
    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const last = results[results.length - 1];
    const nextCursor =
      hasMore && last ? encodeSearchCursor(toCursor(last)) : null;
    return { results, nextCursor, hasMore };
  }

  private log(
    searchType: string,
    userId: string,
    q: string,
    started: number,
    resultCount: number,
    filters: Record<string, unknown>
  ): void {
    this.logger.info(
      {
        searchType,
        userId,
        q: truncateSearchLog(q),
        durationMs: Date.now() - started,
        resultCount,
        filters,
      },
      "Search completed"
    );
  }
}
