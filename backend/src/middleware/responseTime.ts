import type { NextFunction, Request, Response } from "express";

/**
 * Measures handler duration and sets X-Response-Time before headers are sent.
 */
export function responseTimeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const started = process.hrtime.bigint();
  req.startTime = Date.now();

  const setHeaderOnce = (): void => {
    if (res.getHeader("X-Response-Time")) {
      return;
    }
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    res.setHeader("X-Response-Time", `${durationMs.toFixed(2)}ms`);
  };

  const originalWriteHead = res.writeHead.bind(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).writeHead = (...args: unknown[]) => {
    setHeaderOnce();
    return originalWriteHead(...(args as Parameters<typeof res.writeHead>));
  };

  next();
}
