import { readFileSync } from "node:fs";
import { effectScope, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/http";
import * as sosApi from "@/api/sos";
import { useSosRequest, type GeolocationProvider } from "./use-sos-request";

const INCIDENT_A = "11111111-1111-4111-8111-111111111111";
const INCIDENT_B = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function catalogRow(id: string) {
  return { id, name: id === INCIDENT_A ? "امداد جاده‌ای" : "امداد کوهستان",
    slug: id === INCIDENT_A ? "road-rescue" : "mountain-rescue", icon: null, color: "#dc2626",
    description: null, createdAt: "2026-10-23T00:00:00Z" };
}

describe("useSosRequest composable", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("wires the authenticated account to the sheet without mounting a Vue component", () => {
    const source = readFileSync(new URL("../components/sos/SosRequestSheet.vue", import.meta.url), "utf8");
    expect(source).toContain("ownerId: computed(() => auth.user?.id ?? null)");
    expect(source).toContain("accessToken: computed(() => auth.accessToken)");
  });

  it("does not replace a newer incident catalog with an older response", async () => {
    let releaseOld!: (rows: ReturnType<typeof catalogRow>[]) => void;
    const oldReply = new Promise<ReturnType<typeof catalogRow>[]>((resolve) => { releaseOld = resolve; });
    const read = vi.spyOn(sosApi, "listSosIncidentTypes")
      .mockReturnValueOnce(oldReply).mockResolvedValueOnce([catalogRow(INCIDENT_B)]);
    const sos = useSosRequest({ ownerId: ref("owner"), accessToken: ref("token-ok") });

    const older = sos.loadCatalog();
    const newer = sos.loadCatalog();
    await newer;
    expect(read).toHaveBeenCalledTimes(2);
    expect(sos.incidentTypes.value.map((row) => row.id)).toEqual([INCIDENT_B]);
    expect(sos.incidentTypeId.value).toBe(INCIDENT_B);
    releaseOld([catalogRow(INCIDENT_A)]);
    await older;
    expect(sos.incidentTypes.value.map((row) => row.id)).toEqual([INCIDENT_B]);
    expect(sos.incidentTypeId.value).toBe(INCIDENT_B);
    expect(sos.loadingCatalog.value).toBe(false);
  });

  it("does not show an old catalog failure after a newer retry succeeded", async () => {
    let rejectOld!: (reason: Error) => void;
    const oldReply = new Promise<ReturnType<typeof catalogRow>[]>((_resolve, reject) => { rejectOld = reject; });
    vi.spyOn(sosApi, "listSosIncidentTypes")
      .mockReturnValueOnce(oldReply).mockResolvedValueOnce([catalogRow(INCIDENT_B)]);
    const sos = useSosRequest({ ownerId: ref("owner"), accessToken: ref("token-ok") });

    const older = sos.loadCatalog();
    await sos.loadCatalog();
    rejectOld(new Error("old offline error"));
    await older;
    expect(sos.incidentTypes.value.map((row) => row.id)).toEqual([INCIDENT_B]);
    expect(sos.catalogError.value).toBeNull();
    expect(sos.loadingCatalog.value).toBe(false);
  });

  it("keeps the catalog loading until the latest read settles", async () => {
    let releaseOld!: (rows: ReturnType<typeof catalogRow>[]) => void;
    let releaseNew!: (rows: ReturnType<typeof catalogRow>[]) => void;
    const oldReply = new Promise<ReturnType<typeof catalogRow>[]>((resolve) => { releaseOld = resolve; });
    const newReply = new Promise<ReturnType<typeof catalogRow>[]>((resolve) => { releaseNew = resolve; });
    vi.spyOn(sosApi, "listSosIncidentTypes").mockReturnValueOnce(oldReply).mockReturnValueOnce(newReply);
    const sos = useSosRequest({ ownerId: ref("owner"), accessToken: ref("token-ok") });

    const older = sos.loadCatalog();
    const newer = sos.loadCatalog();
    releaseOld([catalogRow(INCIDENT_A)]);
    await older;
    expect(sos.loadingCatalog.value).toBe(true);
    expect(sos.incidentTypes.value).toEqual([]);
    releaseNew([catalogRow(INCIDENT_B)]);
    await newer;
    expect(sos.loadingCatalog.value).toBe(false);
    expect(sos.incidentTypeId.value).toBe(INCIDENT_B);
  });

  it("keeps a selected incident type only while it exists in the refreshed catalog", async () => {
    vi.spyOn(sosApi, "listSosIncidentTypes")
      .mockResolvedValueOnce([catalogRow(INCIDENT_A), catalogRow(INCIDENT_B)])
      .mockResolvedValueOnce([catalogRow(INCIDENT_B), catalogRow(INCIDENT_A)])
      .mockResolvedValueOnce([catalogRow(INCIDENT_A)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([catalogRow(INCIDENT_B)]);
    const sos = useSosRequest({ ownerId: ref("owner"), accessToken: ref("token-ok") });
    await sos.loadCatalog();
    sos.incidentTypeId.value = INCIDENT_B;
    sos.description.value = "An emergency needs an available incident category.";
    sos.setManualLocation(35.7, 51.4);
    expect(sos.canSubmit.value).toBe(true);

    await sos.loadCatalog();
    expect(sos.incidentTypeId.value).toBe(INCIDENT_B); // Preserve an available explicit choice.
    await sos.loadCatalog();
    expect(sos.incidentTypeId.value).toBe(""); // Do not silently change the type of an emergency.
    expect(sos.canSubmit.value).toBe(false);
    sos.incidentTypeId.value = INCIDENT_A; // The requester explicitly picks the remaining type.
    expect(sos.canSubmit.value).toBe(true);
    await sos.loadCatalog();
    expect(sos.incidentTypeId.value).toBe("");
    expect(sos.canSubmit.value).toBe(false); // The empty-catalog message must match the draft.
    await sos.loadCatalog();
    expect(sos.incidentTypeId.value).toBe(INCIDENT_B); // Recover when the catalog was empty.
  });

  it("refreshes a cached incident catalog when the SOS sheet opens again", async () => {
    const read = vi.spyOn(sosApi, "listSosIncidentTypes")
      .mockResolvedValueOnce([catalogRow(INCIDENT_A)])
      .mockResolvedValueOnce([catalogRow(INCIDENT_B)]);
    const sos = useSosRequest({ ownerId: ref("owner"), accessToken: ref("token-ok"), geolocation: () => null });
    sos.prepareForOpen();
    await vi.waitFor(() => expect(sos.loadingCatalog.value).toBe(false));
    expect(sos.incidentTypeId.value).toBe(INCIDENT_A);
    sos.prepareForOpen();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(sos.incidentTypes.value.map((type) => type.id)).toEqual([INCIDENT_B]));
    expect(sos.incidentTypeId.value).toBe(""); // An obsolete choice needs explicit replacement.
  });

  it("resets every draft field to its opening defaults, including the incident type", async () => {
    vi.spyOn(sosApi, "listSosIncidentTypes").mockResolvedValue([catalogRow(INCIDENT_A), catalogRow(INCIDENT_B)]);
    let lateGps!: Parameters<GeolocationProvider["getCurrentPosition"]>[0];
    const sos = useSosRequest({
      ownerId: ref("owner"), accessToken: ref("token-ok"),
      geolocation: () => ({ getCurrentPosition: (success) => { lateGps = success; } })
    });
    await sos.loadCatalog();
    sos.severity.value = "medium";
    sos.incidentTypeId.value = INCIDENT_B;
    sos.description.value = "Draft that was abandoned before sending.";
    sos.setManualLocation(35.7, 51.4);
    sos.selectPhoto(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "scene.png", { type: "image/png" }));
    sos.requestGpsLocation();
    sos.reset();
    expect(sos.severity.value).toBe("high");
    expect(sos.incidentTypeId.value).toBe(INCIDENT_A);
    expect(sos.description.value).toBe("");
    expect(sos.location.value).toBeNull();
    expect(sos.latInput.value).toBe("");
    expect(sos.lonInput.value).toBe("");
    expect(sos.photoFile.value).toBeNull();
    expect(sos.locating.value).toBe(false);
    expect(sos.canSubmit.value).toBe(false);
    lateGps({ coords: { latitude: 35.8, longitude: 51.5 } });
    expect(sos.location.value).toBeNull();
  });

  it("recovers from synchronous GPS setup failures and still accepts manual incident coordinates", () => {
    for (const geolocation of [
      () => { throw new Error("Geolocation policy blocked access"); },
      () => ({ getCurrentPosition: () => { throw new Error("GPS bridge failed"); } })
    ]) {
      const sos = useSosRequest({ ownerId: ref("owner"), accessToken: ref("token-ok"), geolocation });
      expect(() => sos.requestGpsLocation()).not.toThrow();
      expect(sos.locating.value).toBe(false);
      expect(sos.locationHint.value).toContain("نقشه");
      expect(sos.setManualLocation(35.7, 51.4)).toBe(true);
      expect(sos.location.value).toEqual({ lat: 35.7, lon: 51.4, isManual: true });
    }
  });

  it("loads incident catalog and GPS fix on open, then submits SOS without photo", async () => {
    vi.spyOn(sosApi, "listSosIncidentTypes").mockResolvedValue([
      {
        id: INCIDENT_A,
        name: "امداد جاده‌ای",
        slug: "road-rescue",
        icon: null,
        color: "#dc2626",
        description: null,
        createdAt: "2026-10-23T00:00:00Z"
      }
    ]);
    const createSpy = vi
      .spyOn(sosApi, "createSosRequest")
      .mockResolvedValue({ requestId: REQUEST_ID, status: "pending" });
    const uploadSpy = vi.spyOn(sosApi, "uploadSosRequestPhoto");

    const geolocation: GeolocationProvider = {
      getCurrentPosition: (onSuccess) => {
        onSuccess({
          coords: {
            latitude: 35.6997,
            longitude: 51.338,
            accuracy: 9
          }
        });
      }
    };

    const sos = useSosRequest({
      ownerId: ref("owner"), accessToken: ref("token-ok"),
      ensureSession: async () => true,
      geolocation: () => geolocation
    });

    sos.prepareForOpen();
    await vi.waitFor(() => {
      expect(sos.incidentTypeId.value).toBe(INCIDENT_A);
      expect(sos.location.value).toEqual({
        lat: 35.6997,
        lon: 51.338,
        isManual: false,
        accuracy: 9
      });
    });

    sos.severity.value = "high";
    sos.description.value = "واژگونی خودرو در کیلومتر ۱۲ جادهٔ کوهستانی";
    expect(sos.canSubmit.value).toBe(true);

    expect(await sos.submit()).toBe(true);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(sos.isCompleted.value).toBe(true);
    expect(sos.createdRequestId.value).toBe(REQUEST_ID);
  });

  it("never files an old SOS draft under a different account after session recovery", async () => {
    let releaseSession!: () => void;
    const pendingSession = new Promise<void>((resolve) => { releaseSession = resolve; });
    const ownerId = ref<string | null>("owner-a");
    const accessToken = ref<string | null>("token-a");
    const create = vi.spyOn(sosApi, "createSosRequest").mockResolvedValue({ requestId: REQUEST_ID, status: "pending" });
    const sos = useSosRequest({ ownerId, accessToken, ensureSession: () => pendingSession });
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "A request drafted by account A before account B signed in.";
    sos.setManualLocation(35.7, 51.4);
    const sending = sos.submit();
    ownerId.value = "owner-b";
    accessToken.value = "token-b";
    releaseSession();
    expect(await sending).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(sos.submitting.value).toBe(false);
    expect(sos.description.value).toBe("");
  });

  it("does not upload account A's photo or display its SOS after an in-flight create crosses logout", async () => {
    let finishCreate!: (result: { requestId: string; status: "pending" }) => void;
    const pendingCreate = new Promise<{ requestId: string; status: "pending" }>((resolve) => { finishCreate = resolve; });
    const create = vi.spyOn(sosApi, "createSosRequest").mockReturnValue(pendingCreate);
    const upload = vi.spyOn(sosApi, "uploadSosRequestPhoto");
    const ownerId = ref<string | null>("owner-a");
    const accessToken = ref<string | null>("token-a");
    const sos = useSosRequest({ ownerId, accessToken });
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "A request filed by account A before logout.";
    sos.setManualLocation(35.7, 51.4);
    sos.selectPhoto(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "scene.png", { type: "image/png" }));
    const sending = sos.submit();
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    accessToken.value = null;
    ownerId.value = null;
    finishCreate({ requestId: REQUEST_ID, status: "pending" });
    expect(await sending).toBe(false); // the server may have committed; never claim the new session owns it
    expect(upload).not.toHaveBeenCalled();
    expect(sos.createdRequestId.value).toBeNull();
    expect(sos.submitting.value).toBe(false);
  });

  it("does not retry account A's photo with account B's token or reapply an old upload response", async () => {
    let releaseSession!: () => void;
    const pendingSession = new Promise<void>((resolve) => { releaseSession = resolve; });
    const upload = vi.spyOn(sosApi, "uploadSosRequestPhoto").mockResolvedValue({ photoUrl: "/uploads/a.png" });
    const ownerId = ref<string | null>("owner-a");
    const accessToken = ref<string | null>("token-a");
    const sos = useSosRequest({ ownerId, accessToken, ensureSession: () => pendingSession });
    sos.createdRequestId.value = REQUEST_ID;
    sos.awaitingPhotoRetry.value = true;
    sos.selectPhoto(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "scene.png", { type: "image/png" }));
    const retry = sos.retryPhotoUpload();
    ownerId.value = "owner-b";
    accessToken.value = "token-b";
    releaseSession();
    expect(await retry).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(sos.createdRequestId.value).toBeNull();
  });

  it("does not resume a queued SOS submission after the sheet is unmounted", async () => {
    let releaseSession!: () => void;
    const pendingSession = new Promise<void>((resolve) => { releaseSession = resolve; });
    const create = vi.spyOn(sosApi, "createSosRequest").mockResolvedValue({ requestId: REQUEST_ID, status: "pending" });
    const scope = effectScope();
    const sos = scope.run(() => useSosRequest({
      ownerId: ref("owner-a"), accessToken: ref("token-a"), ensureSession: () => pendingSession
    }))!;
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "A request abandoned when the sheet leaves the page.";
    sos.setManualLocation(35.7, 51.4);
    const sending = sos.submit();
    scope.stop();
    releaseSession();
    expect(await sending).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not apply an old photo upload response after logout", async () => {
    let finishUpload!: (result: { photoUrl: string }) => void;
    const pendingUpload = new Promise<{ photoUrl: string }>((resolve) => { finishUpload = resolve; });
    vi.spyOn(sosApi, "createSosRequest").mockResolvedValue({ requestId: REQUEST_ID, status: "pending" });
    const upload = vi.spyOn(sosApi, "uploadSosRequestPhoto").mockReturnValue(pendingUpload);
    const ownerId = ref<string | null>("owner-a");
    const accessToken = ref<string | null>("token-a");
    const sos = useSosRequest({ ownerId, accessToken });
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "A request with a photo upload interrupted by logout.";
    sos.setManualLocation(35.7, 51.4);
    sos.selectPhoto(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "scene.png", { type: "image/png" }));
    const sending = sos.submit();
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    accessToken.value = null;
    ownerId.value = null;
    finishUpload({ photoUrl: "/uploads/a.png" });
    expect(await sending).toBe(false);
    expect(sos.createdRequestId.value).toBeNull();
    expect(sos.photoUploadedUrl.value).toBeNull();
    expect(sos.submitting.value).toBe(false);
  });

  it("does not let account A's late create response unlock account B's submission", async () => {
    let finishFirst!: (result: { requestId: string; status: "pending" }) => void;
    let finishSecond!: (result: { requestId: string; status: "pending" }) => void;
    const first = new Promise<{ requestId: string; status: "pending" }>((resolve) => { finishFirst = resolve; });
    const second = new Promise<{ requestId: string; status: "pending" }>((resolve) => { finishSecond = resolve; });
    vi.spyOn(sosApi, "createSosRequest").mockReturnValueOnce(first).mockReturnValueOnce(second);
    const ownerId = ref<string | null>("owner-a");
    const accessToken = ref<string | null>("token-a");
    const sos = useSosRequest({ ownerId, accessToken });
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "First account emergency that is already on the wire.";
    sos.setManualLocation(35.7, 51.4);
    const sendingFirst = sos.submit();
    await vi.waitFor(() => expect(sosApi.createSosRequest).toHaveBeenCalledOnce());
    ownerId.value = "owner-b";
    accessToken.value = "token-b";
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "Second account emergency after account switch.";
    sos.setManualLocation(35.8, 51.5);
    const sendingSecond = sos.submit();
    await vi.waitFor(() => expect(sosApi.createSosRequest).toHaveBeenCalledTimes(2));
    finishFirst({ requestId: REQUEST_ID, status: "pending" });
    expect(await sendingFirst).toBe(false);
    expect(sos.submitting.value).toBe(true);
    expect(sos.createdRequestId.value).toBeNull();
    const secondId = "33333333-3333-4333-8333-333333333333";
    finishSecond({ requestId: secondId, status: "pending" });
    expect(await sendingSecond).toBe(true);
    expect(sos.submitting.value).toBe(false);
    expect(sos.createdRequestId.value).toBe(secondId);
  });

  it("still submits for the same owner after a normal access-token rotation", async () => {
    const token = ref<string | null>("expiring-token");
    const create = vi.spyOn(sosApi, "createSosRequest")
      .mockResolvedValue({ requestId: REQUEST_ID, status: "pending" });
    const sos = useSosRequest({
      ownerId: ref("owner-a"), accessToken: token,
      ensureSession: async () => { token.value = "renewed-token"; }
    });
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "Normal token renewal must not lose an SOS.";
    sos.setManualLocation(35.7, 51.4);
    expect(await sos.submit()).toBe(true);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ incidentTypeId: INCIDENT_A }), "renewed-token");
    expect(sos.createdRequestId.value).toBe(REQUEST_ID);
  });

  it("does not create duplicate emergencies on double submit during session refresh or after success", async () => {
    let releaseSession!: () => void;
    const waitingForSession = new Promise<void>((resolve) => { releaseSession = resolve; });
    const createSpy = vi.spyOn(sosApi, "createSosRequest")
      .mockResolvedValue({ requestId: REQUEST_ID, status: "pending" });
    const sos = useSosRequest({ ownerId: ref("owner"), accessToken: ref("token-ok"), ensureSession: () => waitingForSession });
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "An urgent rescue is needed at the incident location.";
    sos.setManualLocation(35.7, 51.4);

    const first = sos.submit();
    const second = sos.submit();
    const lockedDuringSessionRefresh = sos.submitting.value;
    releaseSession();
    const results = await Promise.all([first, second]);
    expect(lockedDuringSessionRefresh).toBe(true);
    expect(results).toEqual([true, false]);
    expect(createSpy).toHaveBeenCalledOnce();
    expect(sos.canSubmit.value).toBe(false);
    expect(await sos.submit()).toBe(false);
    expect(createSpy).toHaveBeenCalledOnce();

    sos.reset();
    expect(sos.canSubmit.value).toBe(false);
    sos.setManualLocation(35.7, 51.4);
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "A second, separate emergency is at a new location.";
    expect(await sos.submit()).toBe(true);
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it("supports manual coordinate fallback when GPS fails and retries photo upload without duplicating SOS rows", async () => {
    vi.spyOn(sosApi, "listSosIncidentTypes").mockResolvedValue([
      {
        id: INCIDENT_A,
        name: "آواربرداری",
        slug: "debris-rescue",
        icon: null,
        color: "#d97706",
        description: null,
        createdAt: "2026-10-23T00:00:00Z"
      }
    ]);
    const createSpy = vi
      .spyOn(sosApi, "createSosRequest")
      .mockResolvedValue({ requestId: REQUEST_ID, status: "pending" });
    const uploadSpy = vi
      .spyOn(sosApi, "uploadSosRequestPhoto")
      .mockRejectedValueOnce(new ApiError(502, "BAD_GATEWAY", "Temporary gateway error"))
      .mockResolvedValueOnce({ photoUrl: `/uploads/sos/${REQUEST_ID}.png` });

    const failingGeolocation: GeolocationProvider = {
      getCurrentPosition: (_onSuccess, onError) => {
        onError?.({ code: 1, message: "User denied Geolocation" });
      }
    };

    const sos = useSosRequest({
      ownerId: ref("owner"), accessToken: ref("token-ok"),
      ensureSession: async () => true,
      geolocation: () => failingGeolocation
    });

    sos.prepareForOpen();
    await vi.waitFor(() => {
      expect(sos.incidentTypeId.value).toBe(INCIDENT_A);
      expect(sos.locationHint.value).toContain("نقشه");
    });

    sos.setCoordinateInputs("۳۵.۷۱۵۰", "۵۱.۴۰۴۰");
    sos.description.value = "ریزش دیوار در کوچهٔ فرعی و مسدود شدن مسیر خروج";
    sos.selectPhoto(
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "scene.png", { type: "image/png" })
    );

    // Step 1 succeeds, step 2 fails on first attempt -> enters awaitingPhotoRetry without completing
    expect(await sos.submit()).toBe(false);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(sos.createdRequestId.value).toBe(REQUEST_ID);
    expect(sos.awaitingPhotoRetry.value).toBe(true);
    expect(sos.isCompleted.value).toBe(false);

    // Retry sends ONLY the photo upload — never creates a duplicate SOS row
    expect(await sos.retryPhotoUpload()).toBe(true);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy).toHaveBeenCalledTimes(2);
    expect(sos.awaitingPhotoRetry.value).toBe(false);
    expect(sos.isCompleted.value).toBe(true);
    expect(sos.photoUploadedUrl.value).toBe(`/uploads/sos/${REQUEST_ID}.png`);
  });

  it("keeps photo retry single-flight while refreshing the access token", async () => {
    let releaseSession!: () => void;
    const waitingForSession = new Promise<void>((resolve) => { releaseSession = resolve; });
    const uploadSpy = vi.spyOn(sosApi, "uploadSosRequestPhoto")
      .mockResolvedValue({ photoUrl: `/uploads/${REQUEST_ID}.png` });
    const sos = useSosRequest({ ownerId: ref("owner"), accessToken: ref("token-ok"), ensureSession: () => waitingForSession });
    sos.createdRequestId.value = REQUEST_ID;
    sos.awaitingPhotoRetry.value = true;
    sos.selectPhoto(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "scene.png", { type: "image/png" }));

    const first = sos.retryPhotoUpload();
    const second = sos.retryPhotoUpload();
    releaseSession();
    expect(await Promise.all([first, second])).toEqual([true, false]);
    expect(uploadSpy).toHaveBeenCalledOnce();
    expect(sos.awaitingPhotoRetry.value).toBe(false);
  });

  it("does not report completion while a photo is still uploading", async () => {
    let finishUpload!: (value: { photoUrl: string }) => void;
    const pendingUpload = new Promise<{ photoUrl: string }>((resolve) => { finishUpload = resolve; });
    vi.spyOn(sosApi, "createSosRequest").mockResolvedValue({ requestId: REQUEST_ID, status: "pending" });
    const upload = vi.spyOn(sosApi, "uploadSosRequestPhoto").mockReturnValue(pendingUpload);
    const sos = useSosRequest({ ownerId: ref("owner"), accessToken: ref("token-ok") });
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "An urgent rescue is needed at the incident location.";
    sos.setManualLocation(35.7, 51.4);
    sos.selectPhoto(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "scene.png", { type: "image/png" }));

    const sending = sos.submit();
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(sos.createdRequestId.value).toBe(REQUEST_ID);
    expect(sos.submitting.value).toBe(true);
    expect(sos.isCompleted.value).toBe(false); // never enable "new request" before the attachment settles
    finishUpload({ photoUrl: `/uploads/${REQUEST_ID}.png` });
    expect(await sending).toBe(true);
    expect(sos.isCompleted.value).toBe(true);
  });

  it("submits the location and photo picked at tap time, not edits made while refreshing the session", async () => {
    let finishSession!: () => void;
    const pendingSession = new Promise<void>((resolve) => { finishSession = resolve; });
    const create = vi.spyOn(sosApi, "createSosRequest")
      .mockResolvedValue({ requestId: REQUEST_ID, status: "pending" });
    const upload = vi.spyOn(sosApi, "uploadSosRequestPhoto")
      .mockResolvedValue({ photoUrl: `/uploads/${REQUEST_ID}.png` });
    let lateGps!: Parameters<GeolocationProvider["getCurrentPosition"]>[0];
    const sos = useSosRequest({
      ownerId: ref("owner"), accessToken: ref("token-ok"), ensureSession: () => pendingSession,
      geolocation: () => ({ getCurrentPosition: (success) => { lateGps = success; } })
    });
    sos.incidentTypeId.value = INCIDENT_A;
    sos.description.value = "Incident at the first selected location.";
    sos.setManualLocation(35.7, 51.4);
    sos.requestGpsLocation();
    const firstPhoto = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "first.png", { type: "image/png" });
    sos.selectPhoto(firstPhoto);

    const sending = sos.submit();
    expect(sos.setManualLocation(35.8, 51.5)).toBe(false); // a map click during refresh
    lateGps({ coords: { latitude: 35.9, longitude: 51.6, accuracy: 8 } });
    expect(sos.location.value).toEqual({ lat: 35.7, lon: 51.4, isManual: true });
    sos.description.value = "This later edit must not silently change the sent request.";
    expect(sos.selectPhoto(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "later.png", { type: "image/png" }))).toBe(false);
    sos.clearPhoto();
    expect(sos.photoFile.value).toBe(firstPhoto);
    finishSession();
    expect(await sending).toBe(true);
    expect(create).toHaveBeenCalledWith({
      severity: "high", incidentTypeId: INCIDENT_A,
      description: "Incident at the first selected location.",
      location: { lat: 35.7, lon: 51.4, isManual: true }
    }, "token-ok");
    expect(upload).toHaveBeenCalledWith(REQUEST_ID, firstPhoto, "token-ok");
  });

  it("preserves trailing zeros while typing coordinates and clears stale GPS coordinates when invalidated", async () => {
    vi.spyOn(sosApi, "listSosIncidentTypes").mockResolvedValue([
      {
        id: INCIDENT_A,
        name: "امداد شهری",
        slug: "urban-rescue",
        icon: null,
        color: "#0284c7",
        description: null,
        createdAt: "2026-10-23T00:00:00Z"
      }
    ]);

    const sos = useSosRequest({
      ownerId: ref("owner"), accessToken: ref("token-ok"),
      ensureSession: async () => true,
      geolocation: () => ({
        getCurrentPosition: (ok) =>
          ok({ coords: { latitude: 35.6892, longitude: 51.389, accuracy: 8 } })
      })
    });

    sos.prepareForOpen();
    await vi.waitFor(() => expect(sos.location.value).not.toBeNull());
    sos.description.value = "نیاز فوری به کمک پزشکی در ساختمان مسکونی";
    expect(sos.canSubmit.value).toBe(true);

    // Clearing or entering out-of-range coordinate must NEVER leave stale GPS coordinates submittable
    sos.setCoordinateInputs("", "51.389");
    expect(sos.location.value).toBeNull();
    expect(sos.canSubmit.value).toBe(false);

    sos.setCoordinateInputs("999", "51.389");
    expect(sos.location.value).toBeNull();
    expect(sos.canSubmit.value).toBe(false);
    expect(sos.submitError.value).toContain("مختصات");

    // Typing valid coordinates keeps trailing decimals/zeros intact AND immediately enables canSubmit without blur
    sos.setCoordinateInputs("35.6890", "51.3890");
    expect(sos.latInput.value).toBe("35.6890");
    expect(sos.lonInput.value).toBe("51.3890");
    expect(sos.canSubmit.value).toBe(true);
  });

  it("ignores slow late GPS callbacks after the survivor explicitly picks a manual location on the map", async () => {
    let resolveSlowGps:
      | ((pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void)
      | undefined;

    const sos = useSosRequest({
      ownerId: ref("owner"), accessToken: ref("token-ok"),
      ensureSession: async () => true,
      geolocation: () => ({
        getCurrentPosition: (ok) => {
          resolveSlowGps = ok;
        }
      })
    });

    sos.prepareForOpen();
    expect(sos.locating.value).toBe(true);

    // User manually selects exact incident point on MapCanvas while GPS is still resolving.
    sos.setManualLocation(35.744, 51.375);
    expect(sos.locating.value).toBe(false);

    // Slow cell-tower GPS arrives 5 seconds later — must NOT clobber the user's manual pin!
    resolveSlowGps?.({ coords: { latitude: 35.6, longitude: 51.2, accuracy: 950 } });
    expect(sos.location.value).toEqual({
      lat: 35.744,
      lon: 51.375,
      isManual: true
    });
  });
});
