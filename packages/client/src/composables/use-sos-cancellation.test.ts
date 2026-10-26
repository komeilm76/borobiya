import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ref } from "vue";
import type { CancellationReason } from "@shared/index";
import { useSosCancellation } from "./use-sos-cancellation";
import { cancelSosRequest, listSosCancellationReasons } from "../api/sos";
import { ApiError } from "../api/http";

vi.mock("../api/sos", () => ({
  cancelSosRequest: vi.fn(),
  listSosCancellationReasons: vi.fn()
}));

const requesterId = "c0000000-0000-4000-8000-000000000001";
const reasons: CancellationReason[] = [
  { id: "c0000000-0000-4000-8000-000000000002", type: "requester", key: "resolved",
    label: "Resolved", labelFa: "رفع شد", requiresCustomText: false, isActive: true },
  { id: "c0000000-0000-4000-8000-000000000003", type: "requester", key: "other",
    label: "Other", labelFa: "سایر", requiresCustomText: true, isActive: true }
];
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listSosCancellationReasons).mockResolvedValue(reasons);
  vi.mocked(cancelSosRequest).mockResolvedValue();
});

describe("requester SOS cancellation confirmation", () => {
  it("keeps the reason selector and explicit confirmation in the post-submit sheet", () => {
    const sheet = readFileSync(new URL("../components/sos/SosRequestSheet.vue", import.meta.url), "utf8");
    expect(sheet).toContain('v-if="cancellation.cancelled.value"');
    expect(sheet).toContain('<SosCancellationDialog :cancellation="cancellation" />');
    const dialog = readFileSync(new URL("../components/sos/SosCancellationDialog.vue", import.meta.url), "utf8");
    expect(dialog).toContain('v-radio-group v-if="cancellation.reasons.value.length"');
    expect(dialog).toContain(':disabled="!cancellation.canConfirm.value"');
    expect(dialog).toContain('cancellation.selected.value?.requiresCustomText');
    expect(dialog).toContain('cancellation.confirm()');
    expect(dialog).toContain('cancellation.error.value');
  });

  it("requires an explicit reason, validates Other, and never sends twice while saving", async () => {
    const token = ref<string | null>("token");
    const id = ref<string | null>(requesterId);
    const cancel = useSosCancellation(token, id, ref("owner"));
    await cancel.show();
    expect(cancel.canConfirm.value).toBe(false);
    await cancel.confirm();
    expect(cancelSosRequest).not.toHaveBeenCalled();
    cancel.reasonId.value = reasons[1]!.id;
    cancel.customReason.value = "too short";
    expect(cancel.canConfirm.value).toBe(false);
    cancel.customReason.value = "The emergency has resolved.";
    expect(cancel.canConfirm.value).toBe(true);
    const pending = deferred<void>();
    vi.mocked(cancelSosRequest).mockReturnValueOnce(pending.promise);
    const sending = cancel.confirm();
    expect(cancel.submitting.value).toBe(true);
    cancel.dismiss();
    expect(cancel.open.value).toBe(true);
    await cancel.confirm();
    expect(cancelSosRequest).toHaveBeenCalledTimes(1);
    expect(cancelSosRequest).toHaveBeenCalledWith(requesterId, "token", reasons[1]!.id, "The emergency has resolved.");
    pending.resolve();
    await sending;
    expect(cancel.cancelled.value).toBe(true);
    expect(cancel.open.value).toBe(false);
  });

  it("acknowledges a committed cancellation even if the bearer token refreshed during retry", async () => {
    const token = ref<string | null>("old-token");
    const cancel = useSosCancellation(token, ref(requesterId), ref("owner"));
    await cancel.show();
    cancel.reasonId.value = reasons[0]!.id;
    const pending = deferred<void>();
    vi.mocked(cancelSosRequest).mockReturnValueOnce(pending.promise);
    const saving = cancel.confirm();
    token.value = "new-token"; // requestJson retried a 401 and committed with this token
    pending.resolve();
    await saving;
    expect(cancel.cancelled.value).toBe(true);
    expect(cancel.open.value).toBe(false);
  });

  it("does not show a previous account's pending cancellation result after switching users", async () => {
    const token = ref<string | null>("old-token");
    const owner = ref<string | null>("owner");
    const cancel = useSosCancellation(token, ref(requesterId), owner);
    await cancel.show();
    cancel.reasonId.value = reasons[0]!.id;
    const pending = deferred<void>();
    vi.mocked(cancelSosRequest).mockReturnValueOnce(pending.promise);
    const saving = cancel.confirm();
    owner.value = "different-owner";
    token.value = "new-owner-token";
    pending.resolve();
    await saving;
    expect(cancel.cancelled.value).toBe(false);
  });

  it("drops a pending cancellation on reset even if the same account reopens the dialog", async () => {
    const cancel = useSosCancellation(ref("token"), ref(requesterId), ref("owner"));
    await cancel.show();
    cancel.reasonId.value = reasons[0]!.id;
    const oldRequest = deferred<void>();
    const newRequest = deferred<void>();
    vi.mocked(cancelSosRequest).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const previous = cancel.confirm();

    cancel.reset(); // account/panel lifecycle changed while the first request was pending
    expect(cancel.open.value).toBe(false);
    expect(cancel.submitting.value).toBe(false);
    await cancel.show();
    cancel.reasonId.value = reasons[0]!.id;
    const current = cancel.confirm();
    expect(cancel.submitting.value).toBe(true);
    oldRequest.resolve();
    await previous;
    expect(cancel.cancelled.value).toBe(false);
    expect(cancel.open.value).toBe(true);
    expect(cancel.submitting.value).toBe(true); // older finally must not unlock the new request

    newRequest.resolve();
    await current;
    expect(cancel.cancelled.value).toBe(true);
    expect(cancel.submitting.value).toBe(false);
  });

  it("surfaces a conflict without claiming cancellation and supports a fresh retry", async () => {
    const cancel = useSosCancellation(ref("token"), ref(requesterId), ref("owner"));
    await cancel.show();
    cancel.reasonId.value = reasons[0]!.id;
    vi.mocked(cancelSosRequest).mockRejectedValueOnce(new Error("Already in progress"));
    await cancel.confirm();
    expect(cancel.cancelled.value).toBe(false);
    expect(cancel.error.value).toBeTruthy();
    expect(cancel.open.value).toBe(true);
    await cancel.confirm();
    expect(cancel.cancelled.value).toBe(true);
  });

  it("shows an accepted-mission conflict without suggesting another unsafe cancellation", async () => {
    const cancel = useSosCancellation(ref("token"), ref(requesterId), ref("owner"));
    await cancel.show();
    cancel.reasonId.value = reasons[0]!.id;
    vi.mocked(cancelSosRequest).mockRejectedValueOnce(new ApiError(409, "SOS_ALREADY_IN_PROGRESS", "In progress"));
    await cancel.confirm();
    expect(cancel.cancelled.value).toBe(false);
    expect(cancel.error.value).toContain("لغوی ثبت نشد");
    expect(cancel.canConfirm.value).toBe(false);
    await cancel.confirm();
    expect(cancelSosRequest).toHaveBeenCalledTimes(1);
  });

  it("drops a late catalog response when the dialog has closed and requires a fresh token", async () => {
    const token = ref<string | null>("token");
    const cancel = useSosCancellation(token, ref(requesterId), ref("owner"));
    const pending = deferred<CancellationReason[]>();
    vi.mocked(listSosCancellationReasons).mockReturnValueOnce(pending.promise);
    const loading = cancel.show();
    cancel.dismiss();
    pending.resolve(reasons);
    await loading;
    expect(cancel.reasons.value).toEqual([]);
    token.value = null;
    await cancel.show();
    expect(cancel.open.value).toBe(false);
    expect(listSosCancellationReasons).toHaveBeenCalledTimes(1);
  });
});
