import { eq } from "drizzle-orm";
import type { Severity, SosRequestStatus } from "@borobiya/shared";
import type { Database } from "./client";
import { geographyPointSql } from "./location-history-store";
import { incidentTypes, sosRequests } from "./schema";

/**
 * The write behind `POST /_user/sos/requests` (T3.2.2).
 *
 * `photoUrl` is deliberately absent from the input type. The column exists and the shared *record*
 * schema carries it, but the only value it may ever hold is one the upload endpoint mints
 * (`POST /_user/sos/requests/:id/photo`, T3.2.3), because a URL the requester supplies is an
 * address somebody else's browser has to load to read the evidence (spec §9, SECURITY §9). Keeping
 * the field out of the store's vocabulary means the create path cannot grow that hole by forgetting
 * a check — the route refuses the field, and nothing below it could have stored it anyway.
 */
export interface SosRequestLocationInput {
  lat: number;
  lon: number;
  /** Metres, as the device reported the fix. Null when there was no fix to report (manual pick). */
  accuracy: number | null;
  /** True when a human placed the pin because the device position was unusable. */
  isManual: boolean;
}

export interface NewSosRequest {
  requesterId: string;
  severity: Severity;
  description: string;
  incidentTypeId: string;
  location: SosRequestLocationInput;
}

export interface CreatedSosRequest {
  requestId: string;
  /** Read back rather than assumed, so a response can never disagree with the row. */
  status: SosRequestStatus;
}

/**
 * The named incident type is not one an SOS can be filed against: the catalog is data, and on a
 * fresh install it starts empty (nothing is seeded), so "you have not created any incident types
 * yet" is the normal first answer rather than a client bug. The check is existence only —
 * `incident_types` has no `isActive` column, so an admin who drops a type drops it for good and the
 * requests already filed against it are kept alive by the plain (non-cascading) reference. Carrying
 * the id out lets the route name the thing it refused instead of saying "check your input".
 */
export class SosIncidentTypeUnavailableError extends Error {
  readonly incidentTypeId: string;

  constructor(incidentTypeId: string) {
    super(`The incident type ${incidentTypeId} is not available.`);
    this.name = "SosIncidentTypeUnavailableError";
    this.incidentTypeId = incidentTypeId;
  }
}

export interface SosRequestStore {
  createRequest(input: NewSosRequest): Promise<CreatedSosRequest>;
}

/** The catalog probe, exported so its predicate is assertable without a live database. */
export function availableIncidentTypeQuery(db: Database, incidentTypeId: string) {
  return db
    .select({ id: incidentTypes.id })
    .from(incidentTypes)
    .where(eq(incidentTypes.id, incidentTypeId))
    .limit(1);
}

/**
 * The insert, exported for the same reason. `geographyPointSql` takes (lon, lat) because PostGIS
 * wants X then Y; passing the pair the other way round is the classic silent-corruption bug for a
 * rescue map, so the helper that already carries that warning is reused rather than rewritten here.
 */
export function sosRequestInsertQuery(db: Database, input: NewSosRequest) {
  return db
    .insert(sosRequests)
    .values({
      requesterId: input.requesterId,
      severity: input.severity,
      description: input.description,
      incidentTypeId: input.incidentTypeId,
      location: geographyPointSql(input.location.lon, input.location.lat),
      accuracy: input.location.accuracy,
      isManual: input.location.isManual
    })
    .returning({ requestId: sosRequests.id, status: sosRequests.status });
}

export class DrizzleSosRequestStore implements SosRequestStore {
  constructor(private readonly db: Database) {}

  /**
   * Availability and insert share one transaction. Without it an admin deleting the type in between
   * would either file a request that names nothing or fail as a raw driver error, and the plain
   * `REFERENCES` on `incident_type_id` (no cascade, per the ERD) gives no help with the wording of
   * either. The requester is not re-checked here: the `/_user` hook has already loaded that account
   * for this very request, and `requester_id`'s own foreign key is the backstop.
   */
  async createRequest(input: NewSosRequest): Promise<CreatedSosRequest> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const [available] = await availableIncidentTypeQuery(db, input.incidentTypeId);
      if (!available) {
        throw new SosIncidentTypeUnavailableError(input.incidentTypeId);
      }

      const [created] = await sosRequestInsertQuery(db, input);
      if (!created) {
        throw new Error("The inserted SOS request did not come back from the insert.");
      }
      return created;
    });
  }
}
