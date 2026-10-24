import type { ProposalInboxItem, Severity } from "@shared/index";

export const proposalSeverity: Record<Severity, { label: string; tone: string }> = {
  high: { label: "فوری", tone: "urgent" },
  medium: { label: "مهم", tone: "important" },
  low: { label: "عادی", tone: "standard" }
};

/** Approximate straight-line distance, never a promised driving distance or ETA. */
export function proposalDistance(
  from: { lat: number; lon: number } | null,
  to: ProposalInboxItem["details"]
): string {
  if (!from || !to) return "موقعیت شما ثبت نشده";
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = radians(to.sosRequest.location.lat - from.lat);
  const lonDelta = radians(to.sosRequest.location.lon - from.lon);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(from.lat)) *
    Math.cos(radians(to.sosRequest.location.lat)) * Math.sin(lonDelta / 2) ** 2;
  const metres = 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
  return metres < 1000 ? `${Math.round(metres)} متر فاصلهٔ مستقیم` :
    `${(metres / 1000).toFixed(1)} کیلومتر فاصلهٔ مستقیم`;
}

export function proposalTime(value: string): string {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium", timeStyle: "short"
  }).format(ms) : "زمان نامشخص";
}
