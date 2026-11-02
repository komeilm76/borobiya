import { describe, expect, it } from "vitest";
import type { Category, IncidentType, SosRequestRecord, UserProfile } from "@shared/index";
import {
  dailySeries,
  dashboardTotals,
  groupReadiness,
  isOpenRequest,
  rankIncidentTypes,
  share,
  userTotals
} from "./admin-metrics";

const NOW = new Date("2026-03-10T12:00:00.000Z");

function sos(overrides: Partial<SosRequestRecord> & { id: string }): SosRequestRecord {
  return {
    requesterId: "11111111-1111-4111-8111-111111111111",
    severity: "medium",
    description: "توضیح کافی برای درخواست امداد",
    incidentTypeId: "22222222-2222-4222-8222-222222222222",
    location: { lat: 35.7, lng: 51.4 },
    photoUrl: null,
    status: "pending",
    cancellationReasonId: null,
    cancellationCustomText: null,
    cancelledAt: null,
    createdAt: "2026-03-10T08:00:00.000Z",
    ...overrides
  } as SosRequestRecord;
}

function user(overrides: Partial<UserProfile> & { id: string }): UserProfile {
  return {
    username: "rescuer",
    role: "rescuer",
    mustCompleteSecurityQuestions: false,
    isActive: true,
    avgRating: null,
    categories: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  } as UserProfile;
}

function type(id: string, name: string): IncidentType {
  return {
    id,
    name,
    slug: name === "آتش‌سوزی" ? "fire" : "medical",
    icon: "fire",
    color: "#000000",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function category(id: string, name: string, memberCount: number, typeIds: string[]): Category {
  return {
    id,
    name,
    description: null,
    incidentTypeIds: typeIds,
    members: Array.from({ length: memberCount }, (_, index) => ({
      id: `member-${id}-${index}`,
      username: `member${index}`
    })),
    createdAt: "2026-01-01T00:00:00.000Z"
  } as Category;
}

describe("dashboardTotals", () => {
  it("counts open requests, today's queue and terminal states separately", () => {
    const totals = dashboardTotals(
      [
        sos({ id: "a", status: "pending" }),
        sos({ id: "b", status: "dispatched", severity: "high" }),
        sos({ id: "c", status: "completed", createdAt: "2026-03-09T10:00:00.000Z" }),
        sos({ id: "d", status: "cancelled_by_requester", createdAt: "2026-03-01T10:00:00.000Z" })
      ],
      NOW
    );

    expect(totals.total).toBe(4);
    expect(totals.open).toBe(2);
    expect(totals.today).toBe(2);
    expect(totals.highSeverity).toBe(1);
    expect(totals.completed).toBe(1);
    expect(totals.cancelled).toBe(1);
  });

  it("treats only pending/dispatched/accepted as open", () => {
    expect(isOpenRequest(sos({ id: "a", status: "accepted" }))).toBe(true);
    expect(isOpenRequest(sos({ id: "b", status: "expired" }))).toBe(false);
  });
});

describe("dailySeries", () => {
  it("returns one bucket per day, oldest first, and ignores older records", () => {
    const points = dailySeries(
      [
        sos({ id: "a", createdAt: "2026-03-10T06:00:00.000Z" }),
        sos({ id: "b", createdAt: "2026-03-10T09:00:00.000Z" }),
        sos({ id: "c", createdAt: "2026-03-08T09:00:00.000Z" }),
        sos({ id: "d", createdAt: "2026-02-01T09:00:00.000Z" })
      ],
      3,
      NOW
    );

    expect(points).toHaveLength(3);
    expect(points[2]).toEqual({ date: "2026-03-10", count: 2 });
    expect(points[1]).toEqual({ date: "2026-03-09", count: 0 });
    expect(points[0]).toEqual({ date: "2026-03-08", count: 1 });
  });
});

describe("rankIncidentTypes", () => {
  it("orders by volume and labels unknown ids instead of dropping them", () => {
    const ranked = rankIncidentTypes(
      [
        sos({ id: "a", incidentTypeId: "t1" }),
        sos({ id: "b", incidentTypeId: "t2" }),
        sos({ id: "c", incidentTypeId: "t2" }),
        sos({ id: "d", incidentTypeId: "gone" })
      ],
      [type("t1", "آتش‌سوزی"), type("t2", "پزشکی")]
    );

    expect(ranked.map((row) => row.label)).toEqual(["پزشکی", "آتش‌سوزی", "نوع حادثهٔ حذف‌شده"]);
    expect(ranked[0].count).toBe(2);
  });
});

describe("groupReadiness", () => {
  it("derives ready/thin/empty from member count and counts only known types", () => {
    const groups = groupReadiness(
      [
        category("g1", "آتش‌نشانی", 3, ["t1", "gone"]),
        category("g2", "اورژانس", 1, ["t1"]),
        category("g3", "کوهستان", 0, [])
      ],
      [type("t1", "آتش‌سوزی")]
    );

    expect(groups.map((group) => group.state)).toEqual(["ready", "thin", "empty"]);
    expect(groups[0].coverage).toBe(1);
  });
});

describe("userTotals", () => {
  it("counts inactive, groupless and admin accounts", () => {
    const totals = userTotals([
      user({ id: "u1", categories: [{ id: "c1", name: "آتش‌نشانی" }] }),
      user({ id: "u2", isActive: false }),
      user({ id: "u3", role: "admin" })
    ]);

    expect(totals).toEqual({ total: 3, active: 2, inactive: 1, withoutGroup: 2, admins: 1 });
  });
});

describe("share", () => {
  it("never divides by zero", () => {
    expect(share(0, 0)).toBe(0);
    expect(share(1, 3)).toBe(33);
  });
});
