import { and, eq } from "drizzle-orm";
import type { Database } from "./client";
import { sosRequests } from "./schema";

/**
 * Pointing one SOS request at one stored photo (T3.2.3).
 *
 * The ownership rule lives in the `WHERE`, not in a read that precedes the write: one statement both
 * refuses another account's request and refuses to confirm that the id exists, which is the
 * convention every other `/_user` row-level write in this codebase follows.
 */
export interface AttachSosPhotoInput {
  requesterId: string;
  requestId: string;
  photoUrl: string;
}

export type AttachSosPhotoResult = { status: "attached"; photoUrl: string } | { status: "not_found" };

export interface SosPhotoStore {
  attachPhoto(input: AttachSosPhotoInput): Promise<AttachSosPhotoResult>;
}

/**
 * Exported so the predicate — id *and* requester — is assertable without a live database. The
 * `RETURNING` is only an existence signal: the column is nullable, so the one value worth handing
 * back is the one the caller just wrote.
 */
export function attachSosPhotoQuery(db: Database, input: AttachSosPhotoInput) {
  return db
    .update(sosRequests)
    .set({ photoUrl: input.photoUrl })
    .where(and(eq(sosRequests.id, input.requestId), eq(sosRequests.requesterId, input.requesterId)))
    .returning({ photoUrl: sosRequests.photoUrl });
}

export class DrizzleSosPhotoStore implements SosPhotoStore {
  constructor(private readonly db: Database) {}

  async attachPhoto(input: AttachSosPhotoInput): Promise<AttachSosPhotoResult> {
    const [updated] = await attachSosPhotoQuery(this.db, input);
    // No row means "not yours, or not there", and the caller is told those two things identically.
    return updated ? { status: "attached", photoUrl: input.photoUrl } : { status: "not_found" };
  }
}
