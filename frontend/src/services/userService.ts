import type { User } from "../types/chat";

export interface ListUsersParams {
  cursor?: string;
  limit?: number;
}

export interface SearchUsersParams {
  q: string;
  cursor?: string;
  limit?: number;
}

export interface UpdateMyProfileParams {
  name?: string;
  about?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface UserService {
  listUsers(params?: ListUsersParams): Promise<User[]>;
  searchUsers(params: SearchUsersParams): Promise<User[]>;
  getUserById(userId: string): Promise<User>;
  updateMyProfile(params: UpdateMyProfileParams): Promise<User>;
}
