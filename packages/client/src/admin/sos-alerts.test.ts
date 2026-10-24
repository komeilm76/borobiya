import { describe, expect, it, vi } from "vitest";
import type { SosRequestRecord } from "@shared/index";
import {
  buildSosAlertsGeoJson,
  formatResponderDistance,
  isDispatchableSosStatus,
  mergeSosAlertSnapshot,
  parseAdminRescuerCancellationPayload,
  parseSosNewRequestPayload,
  playSosAlertSound,
  SOS_SEVERITY_PRESENTATION,
  SOS_STATUS_PRESENTATION,
  upsertSosAlert,
  type AlertAudioContextLike
} from "./sos-alerts";

function sampleSos(overrides: Partial<SosRequestRecord> = {}): SosRequestRecord {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    requesterId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    severity: "high",
    description: "آتش‌سوزی گسترده در انبار دارویی و نیاز فوری به امداد",
    incidentTypeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    location: {
      lat: 35.7012,
      lon: 51.3498,
      accuracy: 9,
      isManual: false
    },
    photoUrl: null,
    status: "pending",
    cancellationReasonId: null,
    cancellationCustomText: null,
    cancelledAt: null,
    createdAt: "2026-10-23T10:00:00.000Z",
    ...overrides
  };
}

describe("admin SOS alert helpers (T3.2.5)", () => {
  it("validates sos:new-request socket payloads strictly", () => {
    const valid = sampleSos();
    expect(parseSosNewRequestPayload({ sosRequest: valid })).toEqual(valid);
    expect(parseSosNewRequestPayload(null)).toBeNull();
    expect(parseSosNewRequestPayload({ sosRequest: { id: "not-a-uuid" } })).toBeNull();
    expect(parseSosNewRequestPayload({ sosRequest: valid, extra: true })).toBeNull();
  });

  it("accepts only strict admin-scoped cancellation notices with validated location", () => {
    const event = {
      missionId: "11111111-1111-4111-8111-111111111111",
      sosRequestId: sampleSos().id,
      rescuerId: "22222222-2222-4222-8222-222222222222",
      reason: "ناتوانی در ادامه",
      at: "2026-10-24T12:00:00.000Z",
      rescuerLocation: { lat: 35.7, lon: 51.4 },
      reviewRequired: true
    };
    expect(parseAdminRescuerCancellationPayload(event)).toEqual(event);
    expect(parseAdminRescuerCancellationPayload({ ...event, rescuerLocation: null })?.rescuerLocation).toBeNull();
    expect(parseAdminRescuerCancellationPayload({ ...event, rescuerLocation: undefined })).toBeNull();
    expect(parseAdminRescuerCancellationPayload({ ...event, reviewRequired: undefined })).toBeNull();
    expect(parseAdminRescuerCancellationPayload({ ...event, rescuerLocation: { lat: 200, lon: 51 } })).toBeNull();
    expect(parseAdminRescuerCancellationPayload({ ...event, extra: "leak" })).toBeNull();
  });

  it("marks first arrival as isNew=true and deduplicates follow-up photo updates without losing photoUrl", () => {
    const initial = sampleSos({ photoUrl: null });
    const first = upsertSosAlert([], initial);
    expect(first.isNew).toBe(true);
    expect(first.items).toHaveLength(1);

    const withPhoto = sampleSos({ photoUrl: "uploads/evidence-1.png" });
    const second = upsertSosAlert(first.items, withPhoto);
    expect(second.isNew).toBe(false);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.photoUrl).toBe("uploads/evidence-1.png");
  });

  it("preserves concurrent live socket arrivals when an older HTTP snapshot finishes", () => {
    const liveNewer = sampleSos({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-10-23T10:05:00.000Z"
    });
    const restOlder = sampleSos({
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-10-23T10:01:00.000Z"
    });

    const merged = mergeSosAlertSnapshot([liveNewer], [restOlder]);
    expect(merged.map((r) => r.id)).toEqual([liveNewer.id, restOlder.id]);
  });

  it("maps severity colors and [lon, lat] Point coordinates into GeoJSON features", () => {
    const high = sampleSos({ id: "11111111-1111-4111-8111-111111111111", severity: "high" });
    const med = sampleSos({ id: "22222222-2222-4222-8222-222222222222", severity: "medium" });
    const low = sampleSos({ id: "33333333-3333-4333-8333-333333333333", severity: "low" });

    const geojson = buildSosAlertsGeoJson([high, med, low], med.id);
    expect(geojson.features).toHaveLength(3);
    expect(geojson.features[0]?.geometry.coordinates).toEqual([51.3498, 35.7012]);
    expect(geojson.features.map((f) => f.properties.color)).toEqual([
      SOS_SEVERITY_PRESENTATION.high.color,
      SOS_SEVERITY_PRESENTATION.medium.color,
      SOS_SEVERITY_PRESENTATION.low.color
    ]);
    expect(geojson.features.map((f) => f.properties.isSelected)).toEqual([false, true, false]);
    expect(buildSosAlertsGeoJson([sampleSos({ severity: "low", status: "cancelled_by_rescuer" })], null)
      .features[0]?.properties.color).toBe(SOS_SEVERITY_PRESENTATION.high.color);
  });

  it("synthesizes severity-graded Web Audio chimes, respects mute, and closes AudioContext", async () => {
    const startedFrequencies: number[] = [];
    const closeSpy = vi.fn(() => Promise.resolve());
    const resumeSpy = vi.fn(() => Promise.resolve());
    let closeCallback: (() => void) | undefined;

    const fakeContext: AlertAudioContextLike = {
      currentTime: 0,
      state: "suspended",
      destination: {},
      resume: resumeSpy,
      close: closeSpy,
      createOscillator: () => ({
        type: "sine",
        frequency: {
          setValueAtTime: (hz) => {
            startedFrequencies.push(hz);
          }
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn()
        },
        connect: vi.fn()
      })
    };

    const mutedResult = await playSosAlertSound("high", {
      muted: true,
      createContext: () => fakeContext
    });
    expect(mutedResult).toBe(false);
    expect(startedFrequencies).toHaveLength(0);

    const played = await playSosAlertSound("high", {
      muted: false,
      createContext: () => fakeContext,
      scheduleClose: (fn) => {
        closeCallback = fn;
      }
    });
    expect(played).toBe(true);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(startedFrequencies).toEqual([880, 659.25, 880]);

    closeCallback?.();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("formats responder distances cleanly in metres/kilometres and gates dispatchable SOS statuses (T3.3.4)", () => {
    expect(formatResponderDistance(423.4)).toBe("423 متر");
    expect(formatResponderDistance(1480)).toBe("1.5 کیلومتر");
    expect(formatResponderDistance(-5)).toBe("نامشخص");

    expect(isDispatchableSosStatus("pending")).toBe(true);
    expect(isDispatchableSosStatus("dispatched")).toBe(true);
    expect(isDispatchableSosStatus("cancelled_by_rescuer")).toBe(true);
    expect(isDispatchableSosStatus("accepted")).toBe(false);
    expect(isDispatchableSosStatus("completed")).toBe(false);
    expect(SOS_STATUS_PRESENTATION.dispatched.label).toContain("انتظار پذیرش");
  });
});
