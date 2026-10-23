import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "./client";
import { sosRequests } from "./schema";
import { attachSosPhotoQuery, DrizzleSosPhotoStore, type AttachSosPhotoInput } from "./sos-photo-store";

// A driver is only needed to build SQL; no connection is opened until a query runs.
const offlineDb = drizzle(postgres("postgresql://borobiya:unused@127.0.0.1:5432/unused"), {
  schema: { sosRequests }
}) as unknown as Database;

const input: AttachSosPhotoInput = {
  requesterId: "11111111-1111-4111-8111-111111111111",
  requestId: "55555555-5555-4555-8555-555555555555",
  photoUrl: "/uploads/99999999-9999-4999-8999-999999999999.png"
};

describe("attachSosPhotoQuery", () => {
  it("writes the owner check into the same statement as the update", () => {
    const query = attachSosPhotoQuery(offlineDb, input).toSQL();

    expect(query.sql).toContain('update "sos_requests" set "photo_url" = $1');
    // Two predicates, one round trip: reading first and writing second is how an ownership check turns
    // into a confirmed `404` for somebody else's request.
    expect(query.sql).toContain('where ("sos_requests"."id" = $2 and "sos_requests"."requester_id" = $3)');
    expect(query.sql).toContain('returning "photo_url"');
    expect(query.params).toEqual([input.photoUrl, input.requestId, input.requesterId]);
  });

  it("does not touch anything but the photo column", () => {
    const query = attachSosPhotoQuery(offlineDb, input).toSQL();
    const assignment = query.sql.slice(query.sql.indexOf("set ") + 4, query.sql.indexOf(" where "));

    // A re-post replaces which photo the request points at; rewriting severity or status from this path
    // would let an upload change the meaning of the emergency it is attached to.
    expect(assignment).toBe('"photo_url" = $1');
  });
});

describe("DrizzleSosPhotoStore", () => {
  function fakeStore(rows: Array<{ photoUrl: string }>) {
    const set = vi.fn(() => ({
      where: () => ({ returning: async () => rows })
    }));
    const update = vi.fn(() => ({ set }));
    return { store: new DrizzleSosPhotoStore({ update } as unknown as Database), set };
  }

  it("answers with the url the row now holds", async () => {
    const { store, set } = fakeStore([{ photoUrl: input.photoUrl }]);

    await expect(store.attachPhoto(input)).resolves.toEqual({ status: "attached", photoUrl: input.photoUrl });
    // The response is the path the caller sent rather than the column read back, because that column is
    // nullable and its type would then be `string | null` on a row the update just filled.
    expect(set).toHaveBeenCalledWith({ photoUrl: input.photoUrl });
  });

  it("reports not_found for both an unknown id and somebody else's request", async () => {
    const { store } = fakeStore([]);

    await expect(store.attachPhoto(input)).resolves.toEqual({ status: "not_found" });
  });
});
