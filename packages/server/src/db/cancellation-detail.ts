import { eq } from "drizzle-orm";
import type { CancellationReasonDetail } from "@borobiya/shared";
import type { Database } from "./client";
import { cancellationReasons } from "./schema";

/** Resolve a persisted reason even if an admin has since disabled it; never return a reason by itself to a caller. */
export async function readCancellationReason(db: Database, id: string | null,
  customText: string | null): Promise<CancellationReasonDetail | null> {
  if (!id) return null;
  const [row] = await db.select({ id: cancellationReasons.id, key: cancellationReasons.key,
    label: cancellationReasons.label, labelFa: cancellationReasons.labelFa })
    .from(cancellationReasons).where(eq(cancellationReasons.id, id)).limit(1);
  return row ? { ...row, customText } : null;
}
