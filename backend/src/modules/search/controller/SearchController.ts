import type { Request, Response } from "express";
import type { Logger } from "pino";
import { UnauthorizedError } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { ISearchService } from "@modules/search/interfaces/ISearchService.js";
import type {
  SearchDirectoryQuery,
  SearchMessagesQuery,
} from "@modules/search/validators/SearchValidators.js";

/**
 * Search HTTP adapter — no Prisma / FTS SQL.
 */
export class SearchController {
  constructor(
    protected readonly searchService: ISearchService,
    protected readonly logger: Logger
  ) {}

  searchMessages = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const query = req.query as unknown as SearchMessagesQuery;
    const result = await this.searchService.searchMessages(user.id, {
      q: query.q,
      conversationId: query.conversationId,
      senderId: query.senderId,
      messageType: query.messageType,
      includeSystem: query.includeSystem,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      hasAttachments: query.hasAttachments,
      hasLinks: query.hasLinks,
      sort: query.sort,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(result);
  });

  searchUsers = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const query = req.query as unknown as SearchDirectoryQuery;
    const result = await this.searchService.searchUsers(user.id, {
      q: query.q,
      sort: query.sort,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(result);
  });

  searchGroups = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const query = req.query as unknown as SearchDirectoryQuery;
    const result = await this.searchService.searchGroups(user.id, {
      q: query.q,
      sort: query.sort,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(result);
  });

  searchConversations = asyncHandler(async (req: Request, res: Response) => {
    const user = this.requireUser(req);
    const query = req.query as unknown as SearchDirectoryQuery;
    const result = await this.searchService.searchConversations(user.id, {
      q: query.q,
      sort: query.sort,
      cursor: query.cursor,
      limit: query.limit,
    });
    res.status(200).json(result);
  });

  private requireUser(req: Request) {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }
    return req.user;
  }
}
