import type { Category } from "@shared/index";

/** Apply a server-confirmed removal before a best-effort list refresh. Never remove on a failed DELETE. */
export function withoutConfirmedMember(category: Category, categoryId: string, memberId: string): Category {
  if (category.id !== categoryId || !category.members.some((member) => member.id === memberId)) return category;
  return { ...category, members: category.members.filter((member) => member.id !== memberId) };
}
