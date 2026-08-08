import { pinoHttp } from "pino-http";
import type { IncomingMessage } from "node:http";
import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { skipOperationalProbes } from "./operationalProbes.js";

type RequestWithId = IncomingMessage & {
  requestId?: string;
  path?: string;
};

/**
 * Attaches req.log (request-scoped child logger) via pino-http.
 * Prefer req.log in handlers/error middleware over the process logger.
 */
export function createRequestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    customProps: (req: RequestWithId) => ({
      requestId: req.requestId,
    }),
    autoLogging: {
      ignore: (req: RequestWithId) =>
        skipOperationalProbes({ path: req.path ?? req.url?.split("?")[0] ?? "" }),
    },
    serializers: {
      req(req: IncomingMessage & { id?: string }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
        };
      },
    },
  });
}
