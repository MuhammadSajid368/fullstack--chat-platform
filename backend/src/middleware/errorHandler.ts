import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import { ZodError } from "zod";
import { AppError, ErrorCode } from "@common/errors/index.js";
import type { AppConfig } from "@config/index.js";

function resolveRequestLogger(req: Request, fallback: Logger): Logger {
  const scoped = (req as Request & { log?: Logger }).log;
  return scoped ?? fallback;
}

/**
 * Express 404 for unmatched routes.
 */
export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(
    new AppError({
      code: ErrorCode.NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
      statusCode: 404,
    })
  );
}

/**
 * Global error handler — must be registered last.
 * Uses request-scoped logger (req.log) when pino-http has attached one.
 */
export function createErrorHandler(config: AppConfig, logger: Logger) {
  return (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
    const log = resolveRequestLogger(req, logger);

    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "_root";
        fieldErrors[key] = issue.message;
      }

      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Validation failed",
          fieldErrors,
          retryable: false,
        },
      });
      return;
    }

    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        log.error(
          { err, requestId: req.requestId, code: err.code },
          err.message
        );
      } else {
        log.warn(
          { requestId: req.requestId, code: err.code, message: err.message },
          "Operational error"
        );
      }

      res.status(err.statusCode).json(err.toJSON());
      return;
    }

    log.error({ err, requestId: req.requestId }, "Unhandled error");

    const body = {
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: config.isProduction
          ? "An unexpected error occurred"
          : err instanceof Error
            ? err.message
            : "An unexpected error occurred",
        retryable: true,
      },
    };

    res.status(500).json(body);
  };
}
