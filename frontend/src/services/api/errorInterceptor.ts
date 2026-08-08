import { ApiError, type ApiErrorCode } from "./apiError";
import type { ApiErrorBody } from "./apiTypes";

function mapStatusToCode(status: number): ApiErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "INTERNAL_ERROR";
  return "UNKNOWN";
}

function isRetryable(status: number | undefined, code: ApiErrorCode): boolean {
  if (code === "NETWORK_ERROR" || code === "TIMEOUT" || code === "RATE_LIMITED") {
    return true;
  }
  if (status !== undefined && status >= 500) {
    return true;
  }
  return false;
}

/**
 * Normalize axios / fetch-like failures into ApiError.
 * Never logs passwords, tokens, or message bodies.
 */
export function normalizeHttpError(
  error: unknown,
  requestId?: string
): ApiError {
  if (ApiError.isApiError(error)) {
    return error;
  }

  if (typeof error === "object" && error !== null && "isAxiosError" in error) {
    const axiosError = error as {
      code?: string;
      message?: string;
      response?: {
        status?: number;
        data?: ApiErrorBody;
      };
      request?: unknown;
    };

    if (axiosError.code === "ECONNABORTED") {
      return new ApiError({
        code: "TIMEOUT",
        message: "The request timed out. Please try again.",
        retryable: true,
        requestId,
      });
    }

    if (!axiosError.response) {
      return new ApiError({
        code: "NETWORK_ERROR",
        message:
          "You appear to be offline. Check your connection and try again.",
        retryable: true,
        requestId,
      });
    }

    const status = axiosError.response.status ?? 0;
    const body = axiosError.response.data;
    const nested = body?.error;
    const code =
      (nested?.code as ApiErrorCode | undefined) ??
      (body?.code as ApiErrorCode | undefined) ??
      mapStatusToCode(status);
    const message =
      nested?.message ??
      body?.message ??
      axiosError.message ??
      "Request failed";
    const fieldErrors = nested?.fieldErrors;
    const retryable =
      nested?.retryable ?? isRetryable(status, code);

    return new ApiError({
      code,
      message,
      status,
      fieldErrors,
      retryable,
      requestId,
    });
  }

  if (error instanceof Error) {
    return new ApiError({
      code: "UNKNOWN",
      message: error.message,
      retryable: false,
      requestId,
    });
  }

  return new ApiError({
    code: "UNKNOWN",
    message: "Request failed",
    retryable: false,
    requestId,
  });
}
