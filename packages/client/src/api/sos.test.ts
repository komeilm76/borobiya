import { afterEach, describe, expect, it, vi } from "vitest";
import { SOS_PHOTO_FIELD_NAME } from "@shared/index";
import { ApiError } from "./http";
import { createSosRequest, listSosIncidentTypes, uploadSosRequestPhoto } from "./sos";

const INCIDENT_TYPE_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

describe("SOS client API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches public incident types from GET /_public/incident-types", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: INCIDENT_TYPE_ID,
            name: "امداد کوهستان",
            slug: "mountain-rescue",
            icon: null,
            color: "#dc2626",
            description: null,
            createdAt: "2026-10-23T00:00:00Z"
          }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const items = await listSosIncidentTypes();
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("امداد کوهستان");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/_public/incident-types"),
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin"
      })
    );
  });

  it("posts SOS creation payload without photoUrl even if caller includes one", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ requestId: REQUEST_ID, status: "pending" }), {
        status: 201,
        headers: { "content-type": "application/json" }
      })
    );

    const created = await createSosRequest(
      {
        incidentTypeId: INCIDENT_TYPE_ID,
        severity: "high",
        description: "آسیب زانو در مسیر بازگشت از ارتفاعات",
        location: { lat: 35.6892, lon: 51.389, isManual: false, accuracy: 12 },
        photoUrl: "https://unexpected.example/photo.jpg"
      },
      "tok-2"
    );

    expect(created).toEqual({ requestId: REQUEST_ID, status: "pending" });
    const [, init] = fetchSpy.mock.calls[0]!;
    const sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(sentBody.photoUrl).toBeUndefined();
    expect(sentBody.severity).toBe("high");
  });

  it("uploads SOS photo as a single multipart field matching SOS_PHOTO_FIELD_NAME without forcing JSON Content-Type", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ photoUrl: `/uploads/sos/${REQUEST_ID}.jpg` }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" });
    const result = await uploadSosRequestPhoto(REQUEST_ID, blob, "tok-3");

    expect(result).toEqual({ photoUrl: `/uploads/sos/${REQUEST_ID}.jpg` });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain(`/_user/sos/requests/${REQUEST_ID}/photo`);
    expect(init?.credentials).toBe("same-origin");
    const headers = init?.headers as Headers;
    expect(headers.get("content-type")).toBeNull();
    expect(headers.get("authorization")).toBe("Bearer tok-3");

    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect([...form.keys()]).toEqual([SOS_PHOTO_FIELD_NAME]);
  });

  it("maps non-2xx multipart responses onto ApiError with server code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "PHOTO_TOO_LARGE", message: "Photo exceeds 5 MB limit" }), {
        status: 413,
        headers: { "content-type": "application/json" }
      })
    );

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    await expect(uploadSosRequestPhoto(REQUEST_ID, blob, "tok-4")).rejects.toMatchObject({
      name: "ApiError",
      status: 413,
      code: "PHOTO_TOO_LARGE"
    } satisfies Partial<ApiError>);
  });
});
