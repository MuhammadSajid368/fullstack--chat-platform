import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { ValidationError } from "@common/errors/index.js";

type RequestPart = "body" | "query" | "params";

/**
 * Zod validation middleware factory.
 * Parses and replaces req[part] with the typed result.
 */
export function validateRequest<T>(
  schema: ZodSchema<T>,
  part: RequestPart = "body"
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "_root";
        fieldErrors[key] = issue.message;
      }
      next(new ValidationError("Validation failed", fieldErrors));
      return;
    }

    // Express types treat query/params as parsed QS objects; replace with validated data.
    (req as Request & Record<RequestPart, unknown>)[part] = result.data;
    next();
  };
}
