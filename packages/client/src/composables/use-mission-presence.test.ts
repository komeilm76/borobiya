import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { MissionPresence } from "@shared/index";
import { useMissionPresence } from "./use-mission-presence";

const missionId = "70000000-0000-4000-8000-000000000001";
const otherMissionId = "70000000-0000-4000-8000-000000000002";
function bearer(sub: string, sessionId: string, nonce = 0) {
  return `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub, sessionId, nonce }))}.signature`;
}
const result = (id = missionId): MissionPresence => ({ missionId: id,
  requester: { online: true, lastSeenAt: "2026-10-25T12:00:00Z" },
  rescuer: { online: false, lastSeenAt: "2026-10-25T11:58:00Z" } });

async function settle() { await Promise.resolve(); await nextTick(); await Promise.resolve(); }

describe("mission-scoped transport presence", () => {
  it("ignores a late read after a mission/account switch and clears its poller on unmount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    const pending: Array<{ signal: AbortSignal; resolve: (value: MissionPresence) => void }> = [];
    const read = vi.fn((_token: string, _id: string, signal?: AbortSignal) =>
      new Promise<MissionPresence>((resolve) => pending.push({ signal: signal!, resolve })));
    const id = ref<string | null>(missionId);
    const user = ref<string | null>("u1");
    const scope = effectScope();
    try {
      const presence = scope.run(() => useMissionPresence(id, ref("jwt"), user, read))!;
      await settle();
      id.value = otherMissionId;
      await settle();
      expect(pending[0]?.signal.aborted).toBe(true);
      pending[0]!.resolve(result(missionId));
      await settle();
      expect(presence.requester.value).toBe("unknown");
      pending[1]!.resolve(result(otherMissionId));
      await settle();
      expect(presence.requester.value).toBe("online");
      expect(presence.rescuer.value).toBe("grace");
      user.value = null;
      await settle();
      expect(presence.snapshot.value).toBeNull();
      vi.advanceTimersByTime(60_000);
      expect(read).toHaveBeenCalledTimes(2);
    } finally { scope.stop(); vi.useRealTimers(); }
  });

  it("clears another account's mission presence and aborts its read synchronously", async () => {
    vi.useFakeTimers();
    const token = ref<string | null>("jwt");
    const owner = ref<string | null>("u1");
    const id = ref<string | null>(missionId);
    const reads: Array<{ signal: AbortSignal; resolve: (value: MissionPresence) => void }> = [];
    const read = vi.fn((_bearer: string, _id: string, signal?: AbortSignal) =>
      new Promise<MissionPresence>((resolve) => reads.push({ signal: signal!, resolve })));
    const scope = effectScope();
    try {
      const presence = scope.run(() => useMissionPresence(id, token, owner, read))!;
      reads[0]!.resolve(result());
      await settle();
      expect(presence.snapshot.value?.missionId).toBe(missionId);
      const pending = presence.refresh();
      owner.value = "u2";
      expect(presence.snapshot.value).toBeNull();
      expect(presence.requester.value).toBe("unknown");
      expect(reads[1]!.signal.aborted).toBe(true);
      reads[1]!.resolve(result());
      await pending;
      expect(presence.snapshot.value).toBeNull();
      reads[2]!.resolve(result());
      await settle();
      expect(presence.snapshot.value?.missionId).toBe(missionId);
      token.value = null;
      expect(presence.snapshot.value).toBeNull();
      vi.advanceTimersByTime(60_000);
      expect(read).toHaveBeenCalledTimes(3); // two for u1, one for u2 before logout
    } finally { scope.stop(); vi.useRealTimers(); }
  });

  it("preserves presence through a same-session bearer renewal and polls with the new token", async () => {
    vi.useFakeTimers();
    const first = bearer("u1", "session-1");
    const next = bearer("u1", "session-1", 1);
    const token = ref<string | null>(first);
    const read = vi.fn(async (_bearer: string, id: string) => result(id));
    const scope = effectScope();
    try {
      const presence = scope.run(() => useMissionPresence(ref(missionId), token, ref("u1"), read))!;
      await settle();
      token.value = next;
      await settle();
      expect(presence.snapshot.value?.missionId).toBe(missionId);
      expect(read).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(30_000);
      await settle();
      expect(read).toHaveBeenLastCalledWith(next, missionId, expect.any(AbortSignal));
    } finally { scope.stop(); vi.useRealTimers(); }
  });

  it("retries a rejected in-flight read with a renewed bearer without erasing the last known badge", async () => {
    const token = ref<string | null>(bearer("u1", "session-1"));
    let rejectOld!: (reason: Error) => void;
    const read = vi.fn().mockResolvedValueOnce(result()).mockImplementationOnce(() =>
      new Promise<MissionPresence>((_resolve, reject) => { rejectOld = reject; }))
      .mockResolvedValueOnce(result());
    const scope = effectScope();
    try {
      const presence = scope.run(() => useMissionPresence(ref(missionId), token, ref("u1"), read))!;
      await settle();
      const pending = presence.refresh();
      const next = bearer("u1", "session-1", 1);
      token.value = next;
      rejectOld(new Error("old token rejected"));
      await pending;
      await settle();
      expect(read).toHaveBeenCalledTimes(3);
      expect(read).toHaveBeenLastCalledWith(next, missionId, expect.any(AbortSignal));
      expect(presence.snapshot.value?.missionId).toBe(missionId);
    } finally { scope.stop(); }
  });

  it("clears a previous session's badge immediately and rejects its late poll", async () => {
    const token = ref<string | null>(bearer("u1", "session-1"));
    const reads: Array<{ signal: AbortSignal; resolve: (value: MissionPresence) => void }> = [];
    const read = vi.fn((_bearer: string, _id: string, signal?: AbortSignal) =>
      new Promise<MissionPresence>((resolve) => reads.push({ signal: signal!, resolve })));
    const scope = effectScope();
    try {
      const presence = scope.run(() => useMissionPresence(ref(missionId), token, ref("u1"), read))!;
      reads[0]!.resolve(result());
      await settle();
      const pending = presence.refresh();
      token.value = bearer("u1", "session-2");
      expect(presence.snapshot.value).toBeNull();
      expect(reads[1]!.signal.aborted).toBe(true);
      reads[1]!.resolve(result());
      await pending;
      expect(presence.snapshot.value).toBeNull();
      reads[2]!.resolve(result());
      await settle();
      expect(presence.snapshot.value?.missionId).toBe(missionId);
    } finally { scope.stop(); }
  });

  it("does not read presence with a JWT for a different displayed account", async () => {
    const token = ref<string | null>(bearer("u1", "session-1"));
    const owner = ref<string | null>("u2");
    const read = vi.fn(async (_bearer: string, id: string) => result(id));
    const scope = effectScope();
    try {
      const presence = scope.run(() => useMissionPresence(ref(missionId), token, owner, read))!;
      await settle();
      expect(read).not.toHaveBeenCalled();
      expect(presence.snapshot.value).toBeNull();
      owner.value = "u1";
      await settle();
      expect(read).toHaveBeenCalledTimes(1);
      expect(presence.snapshot.value?.missionId).toBe(missionId);
    } finally { scope.stop(); }
  });

  it("does not display a previous mission's badge between a selection and its next read", async () => {
    const id = ref<string | null>(missionId);
    const read = vi.fn(async (_bearer: string, selected: string) => result(selected));
    const scope = effectScope();
    try {
      const presence = scope.run(() => useMissionPresence(id, ref("jwt"), ref("u1"), read))!;
      await settle();
      expect(presence.snapshot.value?.missionId).toBe(missionId);
      id.value = otherMissionId;
      expect(presence.snapshot.value).toBeNull();
      await settle();
      expect(presence.snapshot.value?.missionId).toBe(otherMissionId);
    } finally { scope.stop(); }
  });

  it("does not keep stale connected state when a poll fails, and never accepts another mission ID", async () => {
    const read = vi.fn().mockResolvedValueOnce(result(otherMissionId)).mockResolvedValueOnce(result())
      .mockRejectedValueOnce(new Error("offline"));
    const scope = effectScope();
    try {
      const presence = scope.run(() => useMissionPresence(ref(missionId), ref("jwt"), ref("u1"), read))!;
      await settle();
      expect(presence.requester.value).toBe("unknown");
      await presence.refresh();
      expect(presence.snapshot.value?.missionId).toBe(missionId);
      await presence.refresh();
      expect(presence.snapshot.value).toBeNull();
    } finally { scope.stop(); }
  });
});
