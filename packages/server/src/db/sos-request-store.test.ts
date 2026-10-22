import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "./client";
import { incidentTypes, sosRequests } from "./schema";
import {
  availableIncidentTypeQuery,
  DrizzleSosRequestStore,
  sosRequestInsertQuery,
  SosIncidentTypeUnavailableError,
  type NewSosRequest
} from "./sos-request-store";

// A driver is only needed to build SQL; no connection is opened until a query runs.
const offlineDb = drizzle(postgres("postgresql://borobiya:unused@127.0.0.1:5432/unused"), {
  schema: { incidentTypes, sosRequests }
}) as unknown as Database;

/**
 * Splits a rendered SQL list on commas that are not nested in parentheses, so `ST_SetSRID(
 * ST_MakePoint($5, $6), 4326)` stays one element instead of shifting every later position.
 */
function topLevelList(text: string) {
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  items.push(current.trim());
  return items;
}

function requestInput(overrides: Partial<NewSosRequest> = {}): NewSosRequest {
  return {
    requesterId: "11111111-1111-4111-8111-111111111111",
    severity: "high",
    description: "Roof collapse, two people unaccounted for inside.",
    incidentTypeId: "77777777-7777-4777-8777-777777777777",
    location: { lat: 35.6997, lon: 51.3379, accuracy: 12, isManual: false },
    ...overrides
  };
}

/**
 * A transaction runner that hands the same stub to the store, so the orchestration — what runs in
 * which order, and what happens when the catalog probe comes back empty — is testable without a
 * server. `rows` is what the incident-type select reports.
 */
function fakeDatabase(rows: Array<{ id: string }>) {
  const calls: string[] = [];
  const insertValues = vi.fn(async () => {
    calls.push("insert");
    return [{ requestId: "99999999-9999-4999-8999-999999999999", status: "pending" as const }];
  });
  const executor = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            calls.push("select");
            return rows;
          }
        })
      })
    }),
    insert: () => ({ values: () => ({ returning: insertValues }) })
  };
  const db = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(executor)
  };
  return { db: db as unknown as Database, calls, insertValues };
}

describe("SOS request creation queries", () => {
  it("writes the position as a PostGIS geography with longitude first", () => {
    const query = sosRequestInsertQuery(offlineDb, requestInput()).toSQL();

    expect(query.sql).toContain('insert into "sos_requests"');
    // The one assertion that keeps a rescue map from putting every request in the wrong country:
    // PostGIS wants X = lon then Y = lat, so the parameter order is the evidence.
    expect(query.sql).toContain("ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography");
    expect(query.params).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "high",
      "Roof collapse, two people unaccounted for inside.",
      "77777777-7777-4777-8777-777777777777",
      51.3379,
      35.6997,
      12,
      false
    ]);
    expect(query.sql).toContain('returning "id", "status"');
  });

  it("leaves the photo column to its default, because the upload endpoint is its only writer", () => {
    const query = sosRequestInsertQuery(offlineDb, requestInput()).toSQL();
    const columns = topLevelList(query.sql.slice(query.sql.indexOf('"sos_requests" (') + 16, query.sql.indexOf(") values")));
    const values = topLevelList(query.sql.slice(query.sql.indexOf("values (") + 8, query.sql.indexOf(") returning")));
    expect(values).toHaveLength(columns.length);

    // `photo_url` is present in the column list but written as `default`, i.e. NULL: the store's input
    // type has no field for it, so no caller of `createRequest` can put a requester-chosen URL there.
    expect(values[columns.indexOf('"photo_url"')]).toBe("default");
    expect(values[columns.indexOf('"cancellation_reason_id"')]).toBe("default");
    expect(values[columns.indexOf('"status"')]).toBe("default");
  });

  it("reports a missing accuracy as no report rather than a zero-metre radius", () => {
    const query = sosRequestInsertQuery(
      offlineDb,
      requestInput({ location: { lat: 35.7, lon: 51.4, accuracy: null, isManual: true } })
    ).toSQL();

    expect(query.params[6]).toBeNull();
    expect(query.params[7]).toBe(true);
  });

  it("looks the incident type up by id alone, since the catalog has no soft disable", () => {
    const query = availableIncidentTypeQuery(offlineDb, requestInput().incidentTypeId).toSQL();

    expect(query.sql).toContain('select "id" from "incident_types"');
    // No `is_active` predicate: `incident_types` has no such column, so adding one here would have
    // been a rule the admin surface never offered.
    expect(query.sql).not.toContain("is_active");
    expect(query.params[0]).toBe(requestInput().incidentTypeId);
  });
});

describe("DrizzleSosRequestStore", () => {
  it("files nothing when the catalog does not know the incident type, and says which one", async () => {
    const { db, calls, insertValues } = fakeDatabase([]);
    const store = new DrizzleSosRequestStore(db);

    await expect(store.createRequest(requestInput())).rejects.toBeInstanceOf(SosIncidentTypeUnavailableError);
    await expect(
      store.createRequest(requestInput({ incidentTypeId: "55555555-5555-4555-8555-555555555555" }))
    ).rejects.toThrow(/55555555-5555-4555-8555-555555555555/);
    expect(calls).toEqual(["select", "select"]);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("reads the status back off the row it inserted rather than assuming it", async () => {
    const { db, calls } = fakeDatabase([{ id: "77777777-7777-4777-8777-777777777777" }]);
    const store = new DrizzleSosRequestStore(db);

    await expect(store.createRequest(requestInput())).resolves.toEqual({
      requestId: "99999999-9999-4999-8999-999999999999",
      status: "pending"
    });
    // One probe, one insert, inside the single transaction the race needs.
    expect(calls).toEqual(["select", "insert"]);
  });

  it("fails loudly if the insert comes back with no row", async () => {
    const executor = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "x" }] }) }) }),
      insert: () => ({ values: () => ({ returning: async () => [] }) })
    };
    const db = { transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(executor) } as unknown as Database;

    await expect(new DrizzleSosRequestStore(db).createRequest(requestInput())).rejects.toThrow(
      /did not come back from the insert/
    );
  });
});
