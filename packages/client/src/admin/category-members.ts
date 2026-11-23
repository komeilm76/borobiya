import type { Category, CategoryMember } from "@shared/index";

/** Keep server-acknowledged additions visible even if the follow-up list refresh fails. */
export function withConfirmedMembers(category: Category, categoryId: string, additions: readonly CategoryMember[]): Category {
  if (category.id !== categoryId || additions.length === 0) return category;
  const known = new Set(category.members.map((member) => member.id));
  const fresh = additions.filter((member) => {
    if (known.has(member.id)) return false;
    known.add(member.id);
    return true;
  });
  return fresh.length ? { ...category, members: [...category.members, ...fresh] } : category;
}

/** Apply a server-confirmed removal before a best-effort list refresh. Never remove on a failed DELETE. */
export function withoutConfirmedMember(category: Category, categoryId: string, memberId: string): Category {
  if (category.id !== categoryId || !category.members.some((member) => member.id === memberId)) return category;
  return { ...category, members: category.members.filter((member) => member.id !== memberId) };
}
