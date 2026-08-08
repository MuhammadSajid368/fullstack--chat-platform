import type { AuthService } from "../authService";
import type {
  AuthSession,
  LoginCredentials,
  RegisterCredentials,
} from "../../types/auth";
import { MOCK_USERS, CURRENT_USER_ID } from "../../data/mockChatData";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Dev-only demo credentials. Not used in production builds. */
export const DEV_DEMO_CREDENTIALS = {
  email: "demo@chat.app",
  password: "demo1234",
} as const;

class MockAuthService implements AuthService {
  private session: AuthSession | null = null;

  getDevCredentials(): typeof DEV_DEMO_CREDENTIALS | null {
    if (!import.meta.env.DEV) {
      return null;
    }
    return DEV_DEMO_CREDENTIALS;
  }

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    await delay(400);

    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password;

    if (
      email !== DEV_DEMO_CREDENTIALS.email ||
      password !== DEV_DEMO_CREDENTIALS.password
    ) {
      throw new Error("Invalid email or password");
    }

    const mockUser = MOCK_USERS[CURRENT_USER_ID];
    const session: AuthSession = {
      user: {
        id: CURRENT_USER_ID,
        email: DEV_DEMO_CREDENTIALS.email,
        name: mockUser?.name ?? "You",
        avatar: mockUser?.avatar ?? "",
      },
    };

    this.session = session;
    return session;
  }

  async register(credentials: RegisterCredentials): Promise<AuthSession> {
    await delay(400);

    const email = credentials.email.trim().toLowerCase();
    if (!credentials.name.trim()) {
      throw new Error("Name is required");
    }
    if (credentials.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    const session: AuthSession = {
      user: {
        id: `mock-${Date.now()}`,
        email,
        name: credentials.name.trim(),
        avatar: "",
        globalRole: "USER",
      },
    };

    this.session = session;
    return session;
  }

  async logout(): Promise<void> {
    await delay(100);
    this.session = null;
  }

  async getSession(): Promise<AuthSession | null> {
    await delay(50);
    return this.session;
  }

  async refresh(): Promise<AuthSession | null> {
    await delay(50);
    return this.session;
  }
}

export const mockAuthService = new MockAuthService();
