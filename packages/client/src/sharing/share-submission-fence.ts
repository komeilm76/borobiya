import { decodeAccessTokenClaims } from "@/composables/device-identity";

/** Same-session bearer renewal may continue; a different JWT login needs fresh share consent. */
export function shareSessionKey(owner: string | null, bearer: string | null): string | null {
  if (!owner || !bearer) return null;
  const claims = decodeAccessTokenClaims(bearer);
  if (bearer.includes(".") && (claims?.sub !== owner || typeof claims.sessionId !== "string")) return null;
  return JSON.stringify([owner, claims?.sessionId ?? null]);
}

/** Prevent async share writes and priority-device lookups from updating a closed or changed session. */
export function createShareSubmissionFence(context: {
  ownerId: () => string | null;
  accessToken: () => string | null;
  isOpen: () => boolean;
}) {
  let revision = 0;

  function begin(): { ownerId: string; session: string | null; revision: number } | null {
    const ownerId = context.ownerId();
    const bearer = context.accessToken();
    if (!ownerId || !context.isOpen()) return null;
    const session = shareSessionKey(ownerId, bearer);
    // Null bearer may recover through ensureSession; a mismatched JWT must never create a ticket.
    if (bearer && !session) return null;
    return { ownerId, session, revision: ++revision };
  }

  function isActive(ticket: ReturnType<typeof begin>): boolean {
    return ticket !== null && ticket.revision === revision && context.isOpen() &&
      context.ownerId() === ticket.ownerId;
  }

  function isCurrent(ticket: ReturnType<typeof begin>): boolean {
    if (!isActive(ticket)) return false;
    const session = shareSessionKey(context.ownerId(), context.accessToken());
    return session !== null && (ticket!.session === null || ticket!.session === session);
  }

  function invalidate(): void {
    revision++;
  }

  return { begin, isActive, isCurrent, invalidate };
}
