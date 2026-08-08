/**
 * Normalized API error used across REST adapters and Redux thunks.
 */

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "CONFIG_ERROR"
  | "UNKNOWN";

export interface ApiErrorOptions {
  code: ApiErrorCode;
  message: string;
  status?: number;
  fieldErrors?: Record<string, string>;
  retryable?: boolean;
  requestId?: string;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly fieldErrors?: Record<string, string>;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.fieldErrors = options.fieldErrors;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId;
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }

  toUserMessage(): string {
    switch (this.code) {
      case "UNAUTHORIZED":
        // Prefer server message (e.g. login: "Invalid email or password").
        // Generic session copy is only for empty/unknown unauthorized bodies.
        if (
          this.message &&
          this.message.trim().length > 0 &&
          !/^unauthorized$/i.test(this.message.trim())
        ) {
          return this.message;
        }
        return "Your session has expired. Please sign in again.";
      case "FORBIDDEN":
        return "You no longer have permission to perform this action.";
      case "NOT_FOUND":
        return "The requested resource was not found.";
      case "CONFLICT":
        return this.message || "This action conflicts with the current state.";
      case "VALIDATION_ERROR":
        return this.message || "Please check the highlighted fields.";
      case "NETWORK_ERROR":
        return "You appear to be offline. Check your connection and try again.";
      case "TIMEOUT":
        return "The request timed out. Please try again.";
      case "CONFIG_ERROR":
        return this.message;
      case "RATE_LIMITED":
        return "Too many requests. Please wait a moment and try again.";
      default:
        return this.message || "Something went wrong. Please try again.";
    }
  }
}

export function getErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (ApiError.isApiError(error)) {
    return error.toUserMessage();
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
