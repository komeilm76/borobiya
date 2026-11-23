import { pinia } from "@/stores";
import { useAuthStore } from "@/stores/auth";
import { useRescuerMissionShareStore } from "@/stores/rescuer-mission-share";
import type { AssignmentStatus } from "./guards";

/** The app-owned mission manager verifies the server's assignment list for this session. */
export async function checkPostLoginAssignment(): Promise<AssignmentStatus> {
  const auth = useAuthStore(pinia);
  const userId = auth.user?.id;
  const token = auth.accessToken;
  if (!userId || !token || auth.user?.role !== "user") return { verified: false, mission: null };
  const share = useRescuerMissionShareStore(pinia);
  await share.refresh();
  // A response for the previous session must never decide the next account's tab.
  if (auth.user?.id !== userId || auth.accessToken !== token) return { verified: false, mission: null };
  return { verified: share.verified, mission: share.mission };
}
