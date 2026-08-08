import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { getApiBaseUrl, getRequestTimeoutMs, isRestMode } from "../../config/env";
import { ApiError } from "./apiError";
import { handleUnauthorizedResponse } from "./authInterceptor";
import { normalizeHttpError } from "./errorInterceptor";

let restClient: AxiosInstance | null = null;

/** Auth endpoints that return 401 for bad credentials / no session — not a live-session expiry. */
const AUTH_CREDENTIAL_401_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/me",
  "/auth/refresh",
];

function isAuthCredentialRequest(config?: { url?: string; baseURL?: string }): boolean {
  const url = config?.url ?? "";
  // axios may pass relative `/auth/login` or absolute URLs
  return AUTH_CREDENTIAL_401_PATHS.some(
    (path) => url === path || url.endsWith(path) || url.includes(`${path}?`)
  );
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lazily creates the REST axios client.
 * Must only be called when VITE_CHAT_SERVICE_MODE=rest.
 * Mock mode never initializes this client or its interceptors.
 */
export function getHttpClient(): AxiosInstance {
  if (!isRestMode()) {
    throw new ApiError({
      code: "CONFIG_ERROR",
      message:
        "HTTP client is only available in REST mode. Set VITE_CHAT_SERVICE_MODE=rest.",
    });
  }

  if (restClient) {
    return restClient;
  }

  const baseURL = getApiBaseUrl();

  restClient = axios.create({
    baseURL,
    timeout: getRequestTimeoutMs(),
    withCredentials: true,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  restClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const requestId = createRequestId();
    config.headers.set("X-Request-Id", requestId);
    (config as InternalAxiosRequestConfig & { requestId?: string }).requestId =
      requestId;
    return config;
  });

  restClient.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const config = (error as { config?: { requestId?: string; url?: string; baseURL?: string } })
        ?.config;
      const apiError = normalizeHttpError(error, config?.requestId);
      if (
        (apiError.code === "UNAUTHORIZED" || apiError.status === 401) &&
        !isAuthCredentialRequest(config)
      ) {
        handleUnauthorizedResponse();
      }
      return Promise.reject(apiError);
    }
  );

  return restClient;
}

/** Test-only: reset singleton between tests. */
export function resetHttpClientForTests(): void {
  restClient = null;
}

export async function httpGet<T>(
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await getHttpClient().get<T>(url, config);
  return response.data;
}

export async function httpPost<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await getHttpClient().post<T>(url, data, config);
  return response.data;
}

export async function httpPatch<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await getHttpClient().patch<T>(url, data, config);
  return response.data;
}

export async function httpDelete<T>(
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await getHttpClient().delete<T>(url, config);
  return response.data;
}
