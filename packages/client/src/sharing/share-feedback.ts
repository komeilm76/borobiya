import type { ShareCreatedResult } from "./share-form";

/** Shown on the map only after the current-session write is confirmed. */
export function shareCreatedMessage(result: ShareCreatedResult): string {
  const subject = result.mode === "history" ? "تاریخچهٔ مسیر" : "موقعیت زنده";
  if (result.created > 0 && result.reused > 0) return `اشتراک ${subject} با همراهان ثبت و تمدید شد.`;
  if (result.reused > 0) return `اشتراک ${subject} با همراهان تمدید شد.`;
  return `اشتراک ${subject} با همراهان با موفقیت ثبت شد.`;
}
