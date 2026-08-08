import type { Request, Response } from "express";
import type { Logger } from "pino";
import { UnauthorizedError } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { IUserService } from "@modules/users/interfaces/IUserService.js";
import type {
  ListUsersQuery,
  SearchUsersQuery,
  UpdateMyProfileBody,
} from "@modules/users/validators/UserValidators.js";

/**
 * User HTTP adapter — translates Request/Response ↔ service calls.
 * No Prisma. No business logic.
 */
export class UserController {
  constructor(
    protected readonly usersService: IUserService,
    protected readonly logger: Logger
  ) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    this.requireUser(req);
    const query = req.query as unknown as ListUsersQuery;

    this.log(req).info(
      { requestId: req.requestId, limit: query.limit },
      "Users list"
    );

    const result = await this.usersService.listUsers({
      cursor: query.cursor,
      limit: query.limit,
    });

    res.status(200).json(result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    this.requireUser(req);
    const { id } = req.params as { id: string };

    const user = await this.usersService.getUserById(id);
    res.status(200).json({ user });
  });

  search = asyncHandler(async (req: Request, res: Response) => {
    this.requireUser(req);
    const query = req.query as unknown as SearchUsersQuery;

    this.log(req).info(
      { requestId: req.requestId, qLength: query.q.length, limit: query.limit },
      "Users search"
    );

    const result = await this.usersService.searchUsers({
      q: query.q,
      cursor: query.cursor,
      limit: query.limit,
    });

    res.status(200).json(result);
  });

  updateMe = asyncHandler(async (req: Request, res: Response) => {
    const authUser = this.requireUser(req);
    const body = req.body as UpdateMyProfileBody;

    this.log(req).info(
      { requestId: req.requestId, userId: authUser.id },
      "Users update me"
    );

    const user = await this.usersService.updateMyProfile(
      authUser.id,
      {
        name: body.name,
        avatarUrl: body.avatarUrl,
        phone: body.phone,
        about: body.about,
      },
      {
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
        requestId: req.requestId,
      }
    );

    res.status(200).json({ user });
  });

  private requireUser(req: Request) {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }
    return req.user;
  }

  private log(req: Request): Logger {
    return req.log ?? this.logger;
  }
}
