import type { AuthService } from "../authService";
import type {
  AuthSession,
  LoginCredentials,
  RegisterCredentials,
} from "../../types/auth";
import { API_ENDPOINTS } from "../api/endpoints";
import { httpGet, httpPost } from "../api/httpClient";
import type {
  ApiLoginResponse,
  ApiMeResponse,
  ApiRefreshResponse,
} from "../api/apiTypes";
import { transformAuthUser } from "../api/transformers";
import { ApiError, getErrorMessage } from "../api/apiError";
import { syncAccessTokenFromDocumentCookie } from "../socket/tokenStore";

class RestAuthService implements AuthService {
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    try {
      const data = await httpPost<ApiLoginResponse>(API_ENDPOINTS.auth.login, {
        email: credentials.email.trim().toLowerCase(),
        password: credentials.password,
      });
      syncAccessTokenFromDocumentCookie();
      return { user: transformAuthUser(data.user) };
    } catch (error) {
      if (ApiError.isApiError(error) && error.status === 401) {
        throw new Error(
          error.message?.trim() || "Invalid email or password"
        );
      }
      throw new Error(getErrorMessage(error, "Invalid email or password"));
    }
  }

  async register(credentials: RegisterCredentials): Promise<AuthSession> {
    try {
      const data = await httpPost<ApiLoginResponse>(
        API_ENDPOINTS.auth.register,
        {
          name: credentials.name.trim(),
          email: credentials.email.trim().toLowerCase(),
          password: credentials.password,
        }
      );
      syncAccessTokenFromDocumentCookie();
      return { user: transformAuthUser(data.user) };
    } catch (error) {
      if (ApiError.isApiError(error)) {
        if (error.code === "CONFLICT") {
          throw new Error(
            error.message?.trim() || "An account with this email already exists"
          );
        }
        if (error.code === "VALIDATION_ERROR") {
          throw new Error(
            error.message?.trim() || "Please check your registration details"
          );
        }
      }
      throw new Error(getErrorMessage(error, "Registration failed"));
    }
  }

  async logout(): Promise<void> {
    try {
      await httpPost(API_ENDPOINTS.auth.logout);
    } catch {
      // Always clear local session even if logout request fails.
    }
  }

  async getSession(): Promise<AuthSession | null> {
    try {
      syncAccessTokenFromDocumentCookie();
      const data = await httpGet<ApiMeResponse>(API_ENDPOINTS.auth.me);
      return { user: transformAuthUser(data.user) };
    } catch {
      return null;
    }
  }

  async refresh(): Promise<AuthSession | null> {
    try {
      const data = await httpPost<ApiRefreshResponse>(API_ENDPOINTS.auth.refresh);
      syncAccessTokenFromDocumentCookie();
      return { user: transformAuthUser(data.user) };
    } catch {
      return null;
    }
  }
}

export const restAuthService = new RestAuthService();
