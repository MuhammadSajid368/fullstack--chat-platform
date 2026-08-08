import { describe, expect, it } from "vitest";
import {
  BCRYPT_ROUNDS,
  getDummyPasswordHash,
  hashPassword,
  verifyPassword,
} from "../../src/modules/auth/utils/password.js";

describe("password utils", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("secret-pass", true);
    expect(hash).not.toContain("secret-pass");
    expect(await verifyPassword("secret-pass", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("runs compare against a dummy hash when user hash is missing", async () => {
    const started = Date.now();
    const ok = await verifyPassword("anything", null);
    const elapsed = Date.now() - started;
    expect(ok).toBe(false);
    // bcrypt work factor should take measurable time even for missing users
    expect(elapsed).toBeGreaterThan(5);
  });

  it("dummy hash cost matches production bcrypt rounds", async () => {
    const costPrefix = `$2b$${String(BCRYPT_ROUNDS).padStart(2, "0")}$`;
    expect(getDummyPasswordHash().startsWith(costPrefix)).toBe(true);
    const productionHash = await hashPassword("prod-user", false);
    expect(productionHash.startsWith(costPrefix)).toBe(true);
  });
});
