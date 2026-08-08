import type { Request, Response } from "express";
import type { Logger } from "pino";
import type { AppConfig } from "@config/index.js";
import { AppError, ErrorCode } from "@common/errors/index.js";
import { asyncHandler } from "@common/utils/asyncHandler.js";
import type { IAuthService } from "@modules/auth/interfaces/IAuthService.js";
import type { LoginBodyInput, RegisterBodyInput } from "@modules/auth/validators/AuthValidators.js";
import {
  accessCookieName,
  accessCookieOptions,
  clearCookieOptions,
  extractBearerToken,
  refreshCookieName,
  refreshCookieOptions,
} from "@modules/auth/utils/index.js";
import { disconnectUserSockets } from "@websocket/socketSessionRevoker.js";

/**
 * Auth HTTP adapter — translates Request/Response ↔ service calls.
 * No Prisma. No business logic.
 */
export class AuthController {
  constructor(
    protected readonly authService: IAuthService,
    protected readonly config: AppConfig,
    protected readonly logger: Logger
  ) {}

  register = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as RegisterBodyInput;
    const context = this.clientContext(req);

    this.log(req).info(
      { requestId: req.requestId, email: body.email },
      "Auth register attempt"
    );

    const result = await this.authService.register(
      {
        name: body.name,
        email: body.email,
        password: body.password,
      },
      context
    );

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    this.log(req).info(
      {
        requestId: req.requestId,
        userId: result.user.id,
        sessionId: result.sessionId,
      },
      "Auth register success"
    );

    res.status(201).json({ user: result.user });
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as LoginBodyInput;
    const context = this.clientContext(req);

    this.log(req).info(
      { requestId: req.requestId, email: body.email },
      "Auth login attempt"
    );

    const result = await this.authService.login(
      { email: body.email, password: body.password },
      context
    );

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    this.log(req).info(
      {
        requestId: req.requestId,
        userId: result.user.id,
        sessionId: result.sessionId,
      },
      "Auth login success"
    );

    res.status(200).json({ user: result.user });
  });

  me = asyncHandler(async (req: Request, res: Response) => {
    const user = await this.authService.me({
      accessToken: extractBearerToken(req.get("authorization") ?? undefined),
      refreshToken: this.readRefreshCookie(req),
    });

    res.status(200).json({ user });
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.authService.refresh(
      this.readRefreshCookie(req),
      this.clientContext(req)
    );

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    this.log(req).info(
      {
        requestId: req.requestId,
        userId: result.user.id,
        sessionId: result.sessionId,
      },
      "Auth refresh success"
    );

    res.status(200).json({ user: result.user });
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await this.authService.logout(
        {
          accessToken: extractBearerToken(req.get("authorization") ?? undefined),
          refreshToken: this.readRefreshCookie(req),
        },
        this.clientContext(req)
      );
      disconnectUserSockets(result.userId);
    } catch (err) {
      // Logout is idempotent for the browser: clear cookies even if session is gone.
      if (
        !(err instanceof AppError) ||
        err.code !== ErrorCode.UNAUTHORIZED
      ) {
        throw err;
      }
      this.log(req).info(
        { requestId: req.requestId },
        "Auth logout with no active session"
      );
    }

    this.clearAuthCookies(res);
    this.log(req).info({ requestId: req.requestId }, "Auth logout success");
    res.status(204).send();
  });

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string
  ): void {
    res.cookie(
      refreshCookieName(this.config),
      refreshToken,
      refreshCookieOptions(this.config)
    );
    res.cookie(
      accessCookieName(this.config),
      accessToken,
      accessCookieOptions(this.config)
    );
  }

  private clearAuthCookies(res: Response): void {
    const options = clearCookieOptions(this.config);
    res.clearCookie(refreshCookieName(this.config), options);
    res.clearCookie(accessCookieName(this.config), options);
  }

  private readRefreshCookie(req: Request): string | undefined {
    const value = req.cookies?.[refreshCookieName(this.config)];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }

  private clientContext(req: Request) {
    return {
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
      requestId: req.requestId,
    };
  }

  private log(req: Request): Logger {
    return req.log ?? this.logger;
  }
}
