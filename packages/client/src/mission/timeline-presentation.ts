import type { Mission, MissionStatus } from "@shared/index";

const LABELS: Record<MissionStatus, string> = {
  pending: "مأموریت پذیرفته شد", on_the_way: "امدادگر در راه است", arrived: "امدادگر رسید",
  in_progress: "امداد در حال انجام است", completed: "مأموریت پایان یافت",
  cancelled_by_requester: "درخواست‌کننده مأموریت را لغو کرد",
  cancelled_by_rescuer: "امدادگر قادر به ادامه نبود", expired: "مأموریت منقضی شد"
};
export function statusLabel(status: MissionStatus): string { return LABELS[status]; }
export function isTerminal(status: MissionStatus): boolean {
  return status === "completed" || status === "cancelled_by_requester" ||
    status === "cancelled_by_rescuer" || status === "expired";
}
export function actorLabel(changedBy: string | null, mission: Pick<Mission, "rescuerId" | "requesterId">): string {
  if (!changedBy) return "ثبت توسط سامانه";
  if (changedBy === mission.rescuerId) return "ثبت توسط امدادگر";
  if (changedBy === mission.requesterId) return "ثبت توسط درخواست‌کننده";
  return "ثبت توسط مرکز امداد";
}
