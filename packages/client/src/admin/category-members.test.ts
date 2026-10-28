import { describe, expect, it } from "vitest";
import type { Category } from "@shared/index";
import { withoutConfirmedMember } from "./category-members";

const CATEGORY: Category = {
  id: "11111111-1111-4111-8111-111111111111", name: "Mountain team", description: null,
  incidentTypeIds: [], createdAt: "2026-10-28T00:00:00.000Z",
  members: [
    { id: "22222222-2222-4222-8222-222222222222", username: "rescue_one" },
    { id: "33333333-3333-4333-8333-333333333333", username: "rescue_two" }
  ]
};

describe("confirmed category member removal", () => {
  it("keeps the confirmed deletion visible even if a following list read fails", () => {
    const originalRows = [CATEGORY];
    const rows = originalRows.map((row) => withoutConfirmedMember(row, CATEGORY.id, CATEGORY.members[0]!.id));
    const selected = withoutConfirmedMember(CATEGORY, CATEGORY.id, CATEGORY.members[0]!.id);
    // The view keeps these local rows if its best-effort load() reports a network error.
    expect(rows[0]!.members.map((member) => member.username)).toEqual(["rescue_two"]);
    expect(selected.members.map((member) => member.username)).toEqual(["rescue_two"]);
    expect(originalRows[0]!.members).toHaveLength(2);
  });

  it("does not change an unrelated category or a different member", () => {
    const other: Category = { ...CATEGORY, id: "44444444-4444-4444-8444-444444444444" };
    expect(withoutConfirmedMember(other, CATEGORY.id, CATEGORY.members[0]!.id)).toBe(other);
    expect(withoutConfirmedMember(CATEGORY, CATEGORY.id, "55555555-5555-4555-8555-555555555555")).toBe(CATEGORY);
  });
});
