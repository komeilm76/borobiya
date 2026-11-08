type MissionRole = "requester" | "rescuer" | "admin";
const ROLE_NAME: Record<MissionRole, string> = {
  requester: "درخواست‌کننده",
  rescuer: "امدادگر",
  admin: "مدیر مرکز"
};

/** Readable state transitions, deliberately independent of every incoming fix's timestamp. */
export function missionLocationAnnouncement(members: ReadonlyArray<{
  role: MissionRole;
  entry: unknown | null | undefined;
  fresh: boolean;
}>): string {
  const states = members.map(({ role, entry, fresh }) =>
    `${ROLE_NAME[role]}، ${!entry ? "اشتراک آغاز نشده" : fresh ? "موقعیت تازه" : "موقعیت قدیمی"}`);
  return `تازگی موقعیت اعضای مأموریت: ${states.join("؛ ")}. تازگی موقعیت، اتصال دستگاه یا حضور فرد را تأیید نمی‌کند.`;
}
