/** Prevent async share writes and priority-device lookups from updating a closed or changed session. */
export function createShareSubmissionFence(context: {
  ownerId: () => string | null;
  accessToken: () => string | null;
  isOpen: () => boolean;
}) {
  let revision = 0;

  function begin(): { ownerId: string; revision: number } | null {
    const ownerId = context.ownerId();
    return ownerId && context.isOpen() ? { ownerId, revision: ++revision } : null;
  }

  function isActive(ticket: ReturnType<typeof begin>): boolean {
    return ticket !== null && ticket.revision === revision && context.isOpen() &&
      context.ownerId() === ticket.ownerId;
  }

  function isCurrent(ticket: ReturnType<typeof begin>): boolean {
    return isActive(ticket) && context.accessToken() !== null;
  }

  function invalidate(): void {
    revision++;
  }

  return { begin, isActive, isCurrent, invalidate };
}
