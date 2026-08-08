import { describe, expect, it } from "vitest";
import {
  isSafeHttpUrl,
  sanitizeHttpUrl,
} from "../../src/common/utils/safeHttpUrl.js";

describe("safeHttpUrl", () => {
  it("allows http and https", () => {
    expect(isSafeHttpUrl("https://example.com/a")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
  });

  it("rejects dangerous schemes", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,hi")).toBe(false);
    expect(sanitizeHttpUrl("javascript:alert(1)")).toBeNull();
  });
});
