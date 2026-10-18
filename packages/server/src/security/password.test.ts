import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("uses Argon2id and verifies credentials without storing plaintext", async () => {
    const password = "CorrectHorse9!";
    const hash = await hashPassword(password);

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain(password);
    await expect(verifyPassword(hash, password)).resolves.toBe(true);
    await expect(verifyPassword(hash, "incorrect-password")).resolves.toBe(false);
  });
});
