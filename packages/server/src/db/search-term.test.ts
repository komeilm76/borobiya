import { describe, expect, it } from "vitest";
import { containsPattern, escapeLikeSearchTerm } from "./search-term";

describe("admin free-text search", () => {
  it("escapes the pattern characters so a literal underscore stays literal", () => {
    // Without this, `user_name` would also match `userXname`.
    expect(escapeLikeSearchTerm("user_name")).toBe("user\\_name");
    expect(escapeLikeSearchTerm("100%")).toBe("100\\%");
  });

  it("escapes the escape character itself, so a typed backslash cannot start a pattern", () => {
    expect(escapeLikeSearchTerm("a\\b")).toBe("a\\\\b");
  });

  it("leaves ordinary text alone and wraps it as a contains-match", () => {
    expect(containsPattern("آتش‌سوزی")).toBe("%آتش‌سوزی%");
    expect(containsPattern("fire")).toBe("%fire%");
  });
});
