import type { Category, IncidentType, SosRequestRecord, UserProfile } from "@shared/index";

/**
 * Pure aggregations behind the admin dashboard and report pages.
 *
 * The server exposes the SOS queue, the user directory and the responder catalog but no analytics
 * endpoint yet (see `design/admin-panel/README.md` §3). Everything here is derived from those three
 * lists so the screens stay honest: when a page of the queue is missing, the number is wrong in a way
 * the caller can see (`truncated`), not silently invented.
 */

export const OPEN_SOS_STATUSES = ["pending", "dispatched", "accepted"] as const;

export function isOpenRequest(request: SosRequestRecord): boolean {
  return (OPEN_SOS_STATUSES as readonly string[]).includes(request.status);
}

export interface DashboardTotals {
  open: number;
  today: number;
  highSeverity: number;
  completed: number;
  cancelled: number;
  total: number;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function dashboardTotals(records: readonly SosRequestRecord[], now: Date = new Date()): DashboardTotals {
  const dayStart = startOfDay(now).getTime();
  return records.reduce<DashboardTotals>(
    (totals, request) => {
      const createdAt = new Date(request.createdAt).getTime();
      totals.total += 1;
      if (isOpenRequest(request)) totals.open += 1;
      if (createdAt >= dayStart) totals.today += 1;
      if (request.severity === "high" && isOpenRequest(request)) totals.highSeverity += 1;
      if (request.status === "completed") totals.completed += 1;
      if (request.status === "cancelled_by_requester" || request.status === "cancelled_by_rescuer") {
        totals.cancelled += 1;
      }
      return totals;
    },
    { open: 0, today: 0, highSeverity: 0, completed: 0, cancelled: 0, total: 0 }
  );
}

export interface DailyPoint {
  /** ISO date (`YYYY-MM-DD`) so the caller decides how to label it. */
  date: string;
  count: number;
}

/** One bucket per day, oldest first, ending on `now`'s day. Never returns fewer than `days` points. */
export function dailySeries(
  records: readonly SosRequestRecord[],
  days: number,
  now: Date = new Date()
): DailyPoint[] {
  const end = startOfDay(now).getTime();
  const buckets: DailyPoint[] = [];
  const index = new Map<string, number>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end - offset * 24 * 60 * 60 * 1000);
    const iso = date.toISOString().slice(0, 10);
    index.set(iso, buckets.length);
    buckets.push({ date: iso, count: 0 });
  }
  for (const request of records) {
    const iso = new Date(request.createdAt).toISOString().slice(0, 10);
    const position = index.get(iso);
    if (position !== undefined) buckets[position].count += 1;
  }
  return buckets;
}

export interface RankedCount {
  id: string;
  label: string;
  count: number;
}

/** Incident types ordered by volume; types with no request in the window are omitted. */
export function rankIncidentTypes(
  records: readonly SosRequestRecord[],
  types: readonly IncidentType[]
): RankedCount[] {
  const byId = new Map(types.map((type) => [type.id, type]));
  const counts = new Map<string, number>();
  for (const request of records) {
    counts.set(request.incidentTypeId, (counts.get(request.incidentTypeId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: byId.get(id)?.name ?? "نوع حادثهٔ حذف‌شده",
      count
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "fa"));
}

export interface GroupReadiness {
  id: string;
  name: string;
  members: number;
  coverage: number;
  state: "ready" | "thin" | "empty";
}

/**
 * A group is `ready` with three or more members, `thin` with one or two, and `empty` with none —
 * the same three states the dispatch board colours, so an admin can act on a single glance.
 */
export function groupReadiness(
  categories: readonly Category[],
  incidentTypes: readonly IncidentType[]
): GroupReadiness[] {
  const typeIds = new Set(incidentTypes.map((type) => type.id));
  return categories
    .map((category) => {
      const members = category.members.length;
      const coverage = category.incidentTypeIds.filter((id) => typeIds.has(id)).length;
      const state: GroupReadiness["state"] = members >= 3 ? "ready" : members > 0 ? "thin" : "empty";
      return { id: category.id, name: category.name, members, coverage, state };
    })
    .sort((left, right) => right.members - left.members || left.name.localeCompare(right.name, "fa"));
}

export interface UserTotals {
  total: number;
  active: number;
  inactive: number;
  withoutGroup: number;
  admins: number;
}

export function userTotals(users: readonly UserProfile[]): UserTotals {
  return users.reduce<UserTotals>(
    (totals, user) => {
      totals.total += 1;
      if (user.isActive) totals.active += 1;
      else totals.inactive += 1;
      if (user.categories.length === 0) totals.withoutGroup += 1;
      if (user.role === "admin") totals.admins += 1;
      return totals;
    },
    { total: 0, active: 0, inactive: 0, withoutGroup: 0, admins: 0 }
  );
}

/** Percent of two counts, rounded, and never NaN for an empty window. */
export function share(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
