import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { describe, expect, it, vi } from "vitest";
import type { UserSecurityQuestionsStore } from "../db/security-questions-store";
import type { LiveLocationService } from "../location/live";
import { signAccessToken } from "../security/tokens";
import { ADMIN_ROOM, attachRealtime, missionRoom, sessionRoom, userRoom } from "./socket";

const secret = "a".repeat(48);

describe("live socket room isolation and session presence", () => {
  it("joins user/session automatically, admin only after admin auth, and mission only after a DB membership check", async () => {
    const userId = randomUUID();
    const adminId = randomUUID();
    const missionId = randomUUID();
    const deviceId = randomUUID();
    const sessionId = randomUUID();
    const adminSessionId = randomUUID();
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
        const token = await signAccessToken({ userId: user, role, deviceId,
          sessionId: role === "admin" ? adminSessionId : sessionId }, secret);
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
      expect(rooms.get(sessionRoom(sessionId))?.size).toBe(1);
      expect(rooms.get(sessionRoom(adminSessionId))?.size).toBe(1);
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

  it("refreshes connected session presence and records an offline timestamp after the final tab closes", async () => {
    const userId = randomUUID();
    const deviceId = randomUUID();
    const sessionId = randomUUID();
    const writes: Array<{ isOnline: boolean; at: number }> = [];
    const users = {
      async findUserById(id: string) {
        return id === userId ? { id, role: "user" as const, username: "field_user",
          isActive: true, isSuspended: false, mustCompleteSecurityQuestions: false,
          avgRating: null, createdAt: new Date() } : null;
      },
      async hasActiveSession() { return true; },
      async securityQuestionsExist() { return true; },
      async completeSecurityQuestions() { return true; },
      async touchSessionPresence({ isOnline }: { isOnline: boolean }) {
        writes.push({ isOnline, at: Date.now() });
      }
    } satisfies UserSecurityQuestionsStore;
    const http = createServer((_request, reply) => reply.end());
    const realtime = attachRealtime(http, { jwtSecret: secret, users,
      live: {} as LiveLocationService, presenceRefreshIntervalMs: 25 });
    const clients: ClientSocket[] = [];
    try {
      await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
      const address = http.address();
      if (!address || typeof address === "string") throw new Error("missing test port");
      const token = await signAccessToken({ userId, role: "user", deviceId, sessionId }, secret);
      const connect = async () => {
        const client = ioClient(`http://127.0.0.1:${address.port}`, { auth: { token },
          transports: ["websocket"], reconnection: false, timeout: 3000 });
        clients.push(client);
        await new Promise<void>((resolve, reject) => {
          client.once("connect", resolve);
          client.once("connect_error", reject);
        });
        return client;
      };
      const first = await connect();
      await vi.waitFor(() => expect(writes.filter((entry) => entry.isOnline).length).toBeGreaterThanOrEqual(2));
      const second = await connect();
      first.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(writes.some((entry) => !entry.isOnline)).toBe(false);
      second.disconnect();
      await vi.waitFor(() => expect(writes.at(-1)?.isOnline).toBe(false));
      const count = writes.length;
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(writes.length).toBe(count); // no leaked presence timers
    } finally {
      for (const client of clients) client.disconnect();
      await realtime.close();
    }
  });

  it("does not let a delayed disconnect overwrite a reconnect's online presence", async () => {
    const userId = randomUUID();
    const deviceId = randomUUID();
    const sessionId = randomUUID();
    const writes: boolean[] = [];
    let enterOffline!: () => void;
    let releaseOffline!: () => void;
    const offlineEntered = new Promise<void>((resolve) => { enterOffline = resolve; });
    const offlineGate = new Promise<void>((resolve) => { releaseOffline = resolve; });
    const users = {
      async findUserById(id: string) {
        return id === userId ? { id, role: "user" as const, username: "member_one",
          isActive: true, isSuspended: false, mustCompleteSecurityQuestions: false,
          avgRating: null, createdAt: new Date() } : null;
      },
      async hasActiveSession() { return true; },
      async securityQuestionsExist() { return true; },
      async completeSecurityQuestions() { return true; },
      async touchSessionPresence({ isOnline }: { isOnline: boolean }) {
        if (!isOnline) {
          enterOffline();
          await offlineGate; // Simulate an offline DB write held behind a concurrent transaction.
        }
        writes.push(isOnline);
      }
    } satisfies UserSecurityQuestionsStore;
    const http = createServer((_request, reply) => reply.end());
    const realtime = attachRealtime(http, { jwtSecret: secret, users, live: {} as LiveLocationService });
    const clients: ClientSocket[] = [];
    try {
      await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
      const address = http.address();
      if (!address || typeof address === "string") throw new Error("missing test port");
      const token = await signAccessToken({ userId, role: "user", deviceId, sessionId }, secret);
      const port = address.port;
      async function connect() {
        const client = ioClient(`http://127.0.0.1:${port}`, { auth: { token },
          transports: ["websocket"], reconnection: false, timeout: 3000 });
        clients.push(client);
        await new Promise<void>((resolve, reject) => {
          client.once("connect", resolve);
          client.once("connect_error", reject);
        });
        return client;
      }
      const first = await connect();
      await vi.waitFor(() => expect(writes).toEqual([true]));
      first.disconnect();
      await offlineEntered;
      const second = await connect();
      expect(second.connected).toBe(true);
      releaseOffline();
      await vi.waitFor(() => expect(writes).toEqual([true, false, true]));
      expect(realtime.io.sockets.adapter.rooms.get(sessionRoom(sessionId))?.size).toBe(1);
    } finally {
      releaseOffline();
      for (const client of clients) client.disconnect();
      await realtime.close();
    }
  });

});
