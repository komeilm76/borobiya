import { describe, expect, it } from "vitest";
import { avatarInitial } from "./avatar-initial";

describe("companion avatar fallback", () => {
  it("uses the first code point rather than splitting non-BMP characters or HTML-injecting names", () => {
    expect(avatarInitial("  sara ")).toBe("S");
    expect(avatarInitial(" مریم ")).toBe("م");
    expect(avatarInitial("🙂friend")).toBe("🙂");
    expect(avatarInitial(" ")).toBe("؟");
    expect(avatarInitial("<script>")).toBe("<");
  });
});
