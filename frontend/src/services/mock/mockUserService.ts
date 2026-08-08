import type { UserService } from "../userService";
import type { User } from "../../types/chat";
import { mockDataStore } from "../mock/mockDataStore";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

class MockUserService implements UserService {
  async listUsers(): Promise<User[]> {
    await delay(200);
    return Object.values(mockDataStore.users);
  }

  async searchUsers(params: { q: string }): Promise<User[]> {
    await delay(200);
    const query = params.q.trim().toLowerCase();
    if (!query) {
      return [];
    }
    return Object.values(mockDataStore.users).filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.phone?.toLowerCase().includes(query)
    );
  }

  async getUserById(userId: string): Promise<User> {
    await delay(150);
    const user = mockDataStore.users[userId];
    if (!user) {
      throw new Error("User not found");
    }
    return { ...user };
  }

  async updateMyProfile(params: {
    name?: string;
    about?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    await delay(200);
    const currentUserId = Object.keys(mockDataStore.users)[0];
    const user = mockDataStore.users[currentUserId];
    if (!user) {
      throw new Error("User not found");
    }
    const updated: User = {
      ...user,
      name: params.name ?? user.name,
      about: params.about ?? user.about,
      phone: params.phone ?? user.phone,
      avatar: params.avatarUrl ?? user.avatar,
    };
    mockDataStore.users[currentUserId] = updated;
    return { ...updated };
  }
}

export const mockUserService = new MockUserService();
