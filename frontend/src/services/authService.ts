import type {
  AuthSession,
  LoginCredentials,
  RegisterCredentials,
} from "../types/auth";

export interface AuthService {
  login(credentials: LoginCredentials): Promise<AuthSession>;
  register(credentials: RegisterCredentials): Promise<AuthSession>;
  logout(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  refresh(): Promise<AuthSession | null>;
}
