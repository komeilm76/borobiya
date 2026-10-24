import { describe, expect, it } from "vitest";
import { proposalDistance, proposalSeverity, proposalTime } from "./proposal-presentation";

describe("proposal presentation", () => {
  const details = {
    requesterName: "rescue_user", incidentTypeName: "Fire",
    sosRequest: {
      severity: "high" as const, description: "Someone needs assistance right away.",
      location: { lat: 35.7, lon: 51.4, isManual: false },
      photoUrl: null, createdAt: "2026-10-24T12:00:00.000Z"
    }
  };

  it("labels severity without using color alone", () => {
    expect(proposalSeverity.high.label).toBe("فوری");
    expect(proposalSeverity.medium.tone).not.toBe(proposalSeverity.low.tone);
  });

  it("clearly distinguishes opt-in straight-line distance from a driving route", () => {
    expect(proposalDistance(null, details)).toContain("موقعیت شما ثبت نشده");
    expect(proposalDistance({ lat: 35.7, lon: 51.4 }, details)).toContain("۰ متر فاصلهٔ مستقیم".replace("۰", "0"));
    expect(proposalDistance({ lat: 35.8, lon: 51.4 }, details)).toContain("کیلومتر فاصلهٔ مستقیم");
    expect(proposalDistance({ lat: 35.7, lon: 51.4 }, undefined)).toContain("موقعیت شما ثبت نشده");
  });

  it("does not display an invalid timestamp as an apparent real offer time", () => {
    expect(proposalTime("invalid")).toBe("زمان نامشخص");
  });
});
