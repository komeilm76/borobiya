import { describe, expect, it } from "vitest";
import { MAX_SOS_PHOTO_BYTES } from "@shared/index";
import { ApiError } from "@/api/http";
import {
  buildSosCreatePayload,
  canSubmitSosDraft,
  gpsLocationDraft,
  manualLocationDraft,
  normalizeDigits,
  parseCoordinatePair,
  sosApiErrorMessage,
  sosDraftIssues,
  validateSosPhoto
} from "./sos-form";

const INCIDENT_TYPE_ID = "11111111-1111-4111-8111-111111111111";

describe("sos-form helpers", () => {
  it("normalizes Persian and Arabic-Indic digits and parses manual coordinates", () => {
    expect(normalizeDigits("۳۵.۶۸۹۲")).toBe("35.6892");
    expect(normalizeDigits("٥١.٣٨٩٠")).toBe("51.3890");

    expect(parseCoordinatePair("۳۵.۶۸۹۲", "۵۱.۳۸۹۰")).toEqual({
      lat: 35.6892,
      lon: 51.389,
      isManual: true
    });
    expect(parseCoordinatePair("95", "51")).toBeNull();
    expect(parseCoordinatePair("35", "181")).toBeNull();
    expect(parseCoordinatePair("", "51")).toBeNull();
  });

  it("constructs GPS vs manual locations cleanly", () => {
    expect(gpsLocationDraft({ latitude: 35.6891987, longitude: 51.3889736, accuracy: 14.4 })).toEqual({
      lat: 35.689199,
      lon: 51.388974,
      isManual: false,
      accuracy: 14
    });
    expect(manualLocationDraft(35.7, 51.4)).toEqual({
      lat: 35.7,
      lon: 51.4,
      isManual: true
    });
  });

  it("validates optional SOS evidence photos against size and MIME rules", () => {
    expect(validateSosPhoto({ size: 0, type: "image/jpeg" })).toEqual({
      code: "photo_empty",
      field: "photo"
    });
    expect(validateSosPhoto({ size: MAX_SOS_PHOTO_BYTES + 1, type: "image/png" })).toEqual({
      code: "photo_too_large",
      field: "photo"
    });
    expect(validateSosPhoto({ size: 1024, type: "application/pdf" })).toEqual({
      code: "photo_unsupported_format",
      field: "photo"
    });
    expect(validateSosPhoto({ size: 2048, type: "image/webp" })).toBeNull();
  });

  it("validates draft fields and builds server-compliant CreateSosRequest payloads", () => {
    const validDraft = {
      incidentTypeId: INCIDENT_TYPE_ID,
      severity: "high" as const,
      description: "  خودرو در برف گیر کرده و دو نفر نیاز به کمک فوری دارند  ",
      location: manualLocationDraft(35.812345, 51.423456),
      photo: { size: 4096, type: "image/jpeg" }
    };

    expect(sosDraftIssues(validDraft)).toEqual([]);
    expect(canSubmitSosDraft(validDraft)).toBe(true);
    expect(buildSosCreatePayload(validDraft)).toEqual({
      incidentTypeId: INCIDENT_TYPE_ID,
      severity: "high",
      description: "خودرو در برف گیر کرده و دو نفر نیاز به کمک فوری دارند",
      location: { lat: 35.812345, lon: 51.423456, isManual: true }
    });

    expect(
      sosDraftIssues({
        ...validDraft,
        incidentTypeId: "",
        description: "کوتاه",
        location: null
      }).map((issue) => issue.code)
    ).toEqual(["incident_type_required", "description_too_short", "location_required"]);
  });

  it("translates SOS API errors into clear Persian messages", () => {
    expect(sosApiErrorMessage(new ApiError(429, "RATE_LIMITED", "Too many"))).toContain("تعداد درخواست");
    expect(sosApiErrorMessage(new ApiError(413, "PHOTO_TOO_LARGE", "Too large"))).toContain("۵ مگابایت");
    expect(
      sosApiErrorMessage(new ApiError(400, "VALIDATION_ERROR", "Bad type", [{ code: "unsupported_format" }]))
    ).toContain("JPEG");
    expect(
      sosApiErrorMessage(
        new ApiError(400, "VALIDATION_ERROR", "Missing", [{ code: "unknown_incident_type" }])
      )
    ).toContain("نوع حادثه");
  });
});
