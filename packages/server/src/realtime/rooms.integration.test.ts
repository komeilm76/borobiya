import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { describe, expect, it, vi } from "vitest";
import type { UserSecurityQuestionsStore } from "../db/security-questions-store";
import type { LiveLocationService } from "../location/live";
import { signAccessToken } from "../security/tokens";
import { ADMIN_ROOM, attachRealtime, missionRoom, sessionRoom, userRoom } from "./socket";

const secret = "a".repeat(48);

describe("live socket room isolation (T4.3.1)", () => {
  it("joins user/session automatically, admin only after admin auth, and mission only after a DB membership check", async () => {
    const userId = randomUUID();
    const adminId = randomUUID();
    const missionId = randomUUID();
    const deviceId = randomUUID();
    const sessionId = randomUUID();
    const joined = vi.fn(async (_missionId: string, requester: string) => requester === userId);
    const users = {
      async findUserById(id: string) {
        if (id !== userId && id !== adminId) return null;
        return { id, role: id === adminId ? "admin" : "user", username: "member_one",
          isActive: true, isSuspended: false, mustCompleteSecurityQuestions: false,
          avgRating: null, createdAt: new Date() };
      },
      async hasActiveSession() { return true; },
      async securityQuestionsExist() { return true; },
      async completeSecurityQuestions() { return true; }
    } satisfies UserSecurityQuestionsStore;
    const http = createServer((_request, reply) => reply.end());
    const realtime = attachRealtime(http, { jwtSecret: secret, users, live: {} as LiveLocationService,
      missions: { canJoinMissionRoom: joined, missionLocationRole: async () => null } });
    const clients: ClientSocket[] = [];
    try {
      await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
      const address = http.address();
      if (!address || typeof address === "string") throw new Error("missing test port");
      const port = address.port;
      async function connect(user: string, role: "admin" | "user") {
        const token = await signAccessToken({ userId: user, role, deviceId, sessionId }, secret);
        const client = ioClient(`http://127.0.0.1:${port}`, { auth: { token },
          transports: ["websocket"], reconnection: false, timeout: 3000 });
        clients.push(client);
        await new Promise<void>((resolve, reject) => {
          client.once("connect", resolve);
          client.once("connect_error", reject);
        });
        return client;
      }
      const user = await connect(userId, "user");
      const admin = await connect(adminId, "admin");
      const rooms = realtime.io.sockets.adapter.rooms;
      expect(rooms.get(userRoom(userId))?.size).toBe(1);
      expect(rooms.get(userRoom(adminId))?.size).toBe(1);
      expect(rooms.get(sessionRoom(sessionId))?.size).toBe(2);
      expect(rooms.get(ADMIN_ROOM)?.size).toBe(1);
      expect(rooms.has(missionRoom(missionId))).toBe(false);

      expect(await admin.timeout(3000).emitWithAck("mission:subscribe", { missionId }))
        .toEqual({ ok: false, code: "MISSION_UNAVAILABLE" });
      expect(rooms.has(missionRoom(missionId))).toBe(false);
      expect(await user.timeout(3000).emitWithAck("mission:subscribe", { missionId })).toEqual({ ok: true });
      expect(joined).toHaveBeenCalledWith(missionId, userId, "user");
      expect(rooms.get(missionRoom(missionId))?.size).toBe(1);
    } finally {
      for (const client of clients) client.disconnect();
      await realtime.close();
    }
  });
});
