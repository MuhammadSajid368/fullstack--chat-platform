import { ErrorCode } from "./errorCodes.js";

export type AppErrorOptions = {
  code: ErrorCode;
  message: string;
  statusCode?: number;
  fieldErrors?: Record<string, string>;
  retryable?: boolean;
  cause?: unknown;
  details?: unknown;
};

/**
 * Central application error.
 * Controllers/services throw AppError; global handler serializes to API shape.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly fieldErrors?: Record<string, string>;
  readonly retryable: boolean;
  readonly details?: unknown;
  readonly isOperational: boolean = true;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? mapStatus(options.code);
    this.fieldErrors = options.fieldErrors;
    this.retryable = options.retryable ?? false;
    this.details = options.details;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }

    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
        retryable: this.retryable,
      },
    };
  }
}

function mapStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.VALIDATION_ERROR:
    case ErrorCode.BAD_REQUEST:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.CONFLICT:
      return 409;
    case ErrorCode.RATE_LIMITED:
      return 429;
    case ErrorCode.TIMEOUT:
      return 504;
    case ErrorCode.SERVICE_UNAVAILABLE:
      return 503;
    case ErrorCode.NETWORK_ERROR:
    case ErrorCode.INTERNAL_ERROR:
    default:
      return 500;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super({
      code: ErrorCode.VALIDATION_ERROR,
      message,
      statusCode: 400,
      fieldErrors,
      retryable: false,
    });
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super({
      code: ErrorCode.UNAUTHORIZED,
      message,
      statusCode: 401,
    });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super({
      code: ErrorCode.FORBIDDEN,
      message,
      statusCode: 403,
    });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super({
      code: ErrorCode.NOT_FOUND,
      message,
      statusCode: 404,
    });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super({
      code: ErrorCode.CONFLICT,
      message,
      statusCode: 409,
    });
    this.name = "ConflictError";
  }
}
