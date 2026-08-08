import type { UserService } from "../userService";
import type { User } from "../../types/chat";
import { API_ENDPOINTS } from "../api/endpoints";
import { httpGet, httpPatch } from "../api/httpClient";
import type { ApiUserDto } from "../api/apiTypes";
import { transformUser } from "../api/transformers";
import { getErrorMessage } from "../api/apiError";

class RestUserService implements UserService {
  async listUsers(params = {}): Promise<User[]> {
    try {
      const data = await httpGet<{ users?: ApiUserDto[]; results?: ApiUserDto[] }>(
        API_ENDPOINTS.users.list,
        { params }
      );
      const users = data.users ?? data.results ?? [];
      return users.map(transformUser);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to list users"));
    }
  }

  async searchUsers(params: { q: string; cursor?: string; limit?: number }): Promise<User[]> {
    try {
      const data = await httpGet<{ users?: ApiUserDto[]; results?: ApiUserDto[] }>(
        API_ENDPOINTS.users.search,
        { params }
      );
      const users = data.users ?? data.results ?? [];
      return users.map(transformUser);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to search users"));
    }
  }

  async getUserById(userId: string): Promise<User> {
    try {
      const data = await httpGet<{ user: ApiUserDto }>(
        API_ENDPOINTS.users.byId(userId)
      );
      return transformUser(data.user);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to load user"));
    }
  }

  async updateMyProfile(params: {
    name?: string;
    about?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    try {
      const data = await httpPatch<{ user: ApiUserDto }>(
        API_ENDPOINTS.users.me,
        params
      );
      return transformUser(data.user);
    } catch (error) {
      throw new Error(getErrorMessage(error, "Failed to update profile"));
    }
  }
}

export const restUserService = new RestUserService();
