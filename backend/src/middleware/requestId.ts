import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

/**
 * Attaches X-Request-Id (incoming or generated) to the request and response.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.header("x-request-id");
  const requestId =
    incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
