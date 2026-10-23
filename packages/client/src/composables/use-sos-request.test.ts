import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/http";
import * as sosApi from "@/api/sos";
import { useSosRequest, type GeolocationProvider } from "./use-sos-request";

const INCIDENT_A = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

describe("useSosRequest composable", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
      accessToken: ref("token-ok"),
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
      accessToken: ref("token-ok"),
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
      accessToken: ref("token-ok"),
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
});
