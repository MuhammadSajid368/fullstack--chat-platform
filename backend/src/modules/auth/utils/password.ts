import bcrypt from "bcrypt";

/**
 * Production bcrypt cost. Dummy hash MUST use the same cost so unknown-user
 * verification does not leak account existence via timing.
 */
export const BCRYPT_ROUNDS = 12;

/** Test-only faster hashing for fixtures — not used for the dummy hash. */
const TEST_ROUNDS = 4;

/**
 * Precomputed bcrypt hash of a placeholder at {@link BCRYPT_ROUNDS} (cost 12).
 * Always used when no user password hash exists.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$12$fxFbTItS4GCJjD1M8/6sG.AxayuknTVWWbOIs/zmZVJ7sDDZD7PAW";

export function bcryptRounds(isTest: boolean): number {
  return isTest ? TEST_ROUNDS : BCRYPT_ROUNDS;
}

export function getDummyPasswordHash(): string {
  return DUMMY_PASSWORD_HASH;
}

export async function hashPassword(
  password: string,
  isTest = false
): Promise<string> {
  return bcrypt.hash(password, bcryptRounds(isTest));
}

/**
 * Constant-time-ish password check: always runs bcrypt.compare against a real
 * hash (dummy when the account is missing) so response timing does not leak
 * whether the email exists. Dummy uses the same cost factor as production hashes.
 */
export async function verifyPassword(
  password: string,
  passwordHash: string | null | undefined
): Promise<boolean> {
  const hash =
    passwordHash && passwordHash.length > 0
      ? passwordHash
      : DUMMY_PASSWORD_HASH;
  const matches = await bcrypt.compare(password, hash);
  return Boolean(passwordHash) && matches;
}
