import {
  sosNewRequestEventSchema,
  type Severity,
  type SosRequestRecord
} from "@shared/index";

export interface SeverityAlertPresentation {
  color: string;
  label: string;
  badgeColor: "error" | "warning" | "info";
  frequenciesHz: readonly number[];
}

export const SOS_SEVERITY_PRESENTATION: Record<Severity, SeverityAlertPresentation> = {
  high: {
    color: "#dc2626",
    label: "بحرانی (فوری)",
    badgeColor: "error",
    frequenciesHz: [880, 659.25, 880]
  },
  medium: {
    color: "#d97706",
    label: "متوسط",
    badgeColor: "warning",
    frequenciesHz: [659.25, 523.25]
  },
  low: {
    color: "#0284c7",
    label: "کم‌خطر",
    badgeColor: "info",
    frequenciesHz: [523.25]
  }
};

export interface SosStatusPresentation {
  label: string;
  badgeColor: "warning" | "info" | "success" | "error" | "secondary";
}

export const SOS_STATUS_PRESENTATION: Record<SosRequestRecord["status"], SosStatusPresentation> = {
  pending: { label: "در انتظار اعزام", badgeColor: "warning" },
  dispatched: { label: "در انتظار پذیرش امدادگر", badgeColor: "info" },
  accepted: { label: "پذیرفته‌شده در مأموریت", badgeColor: "success" },
  cancelled_by_requester: { label: "لغوشده توسط امدادخواه", badgeColor: "secondary" },
  cancelled_by_rescuer: { label: "لغو توسط امدادگر (نیازمند اعزام مجدد)", badgeColor: "error" },
  expired: { label: "منقضی‌شده", badgeColor: "secondary" },
  completed: { label: "تکمیل‌شده", badgeColor: "success" }
};

export function isDispatchableSosStatus(status: SosRequestRecord["status"]): boolean {
  return status === "pending" || status === "dispatched" || status === "cancelled_by_rescuer";
}

export function formatResponderDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "نامشخص";
  if (metres < 1000) return `${Math.round(metres)} متر`;
  return `${(metres / 1000).toFixed(1)} کیلومتر`;
}

export interface SosAlertGeoFeature {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: string;
    severity: Severity;
    color: string;
    isSelected: boolean;
    isManual: boolean;
    status: SosRequestRecord["status"];
  };
}

export interface SosAlertsFeatureCollection {
  type: "FeatureCollection";
  features: SosAlertGeoFeature[];
}

export interface AudioOscillatorLike {
  type: OscillatorType;
  frequency: { setValueAtTime(value: number, startTime: number): void };
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioGainLike {
  gain: {
    setValueAtTime(value: number, startTime: number): void;
    linearRampToValueAtTime(value: number, endTime: number): void;
    exponentialRampToValueAtTime(value: number, endTime: number): void;
  };
  connect(destination: unknown): void;
}

export interface AlertAudioContextLike {
  readonly currentTime: number;
  readonly state?: string;
  readonly destination: unknown;
  createOscillator(): AudioOscillatorLike;
  createGain(): AudioGainLike;
  resume?(): Promise<void>;
  close?(): Promise<void>;
}

/** Validates an incoming `sos:new-request` Socket.IO payload before mutating admin state. */
export function parseSosNewRequestPayload(payload: unknown): SosRequestRecord | null {
  const parsed = sosNewRequestEventSchema.safeParse(payload);
  return parsed.success ? parsed.data.sosRequest : null;
}

/** Deterministic newest-first ordering (`createdAt DESC`, `id ASC` tie-breaker). */
export function sortSosRequests(items: readonly SosRequestRecord[]): SosRequestRecord[] {
  return [...items].sort((left, right) => {
    const timeDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (timeDelta !== 0 && !Number.isNaN(timeDelta)) return timeDelta;
    return left.id.localeCompare(right.id);
  });
}

function mergeSingleSosRecord(existing: SosRequestRecord, incoming: SosRequestRecord): SosRequestRecord {
  return {
    ...existing,
    ...incoming,
    photoUrl: incoming.photoUrl ?? existing.photoUrl
  };
}

/**
 * Inserts or updates a live SOS request record.
 *
 * `isNew` is `true` strictly on the first sighting of `incoming.id` so follow-up broadcasts for the
 * same request (such as photo evidence attachment right after creation) update `photoUrl` in place
 * without re-triggering the audible siren chime.
 */
export function upsertSosAlert(
  current: readonly SosRequestRecord[],
  incoming: SosRequestRecord
): { items: SosRequestRecord[]; isNew: boolean; record: SosRequestRecord } {
  const existingIndex = current.findIndex((item) => item.id === incoming.id);
  if (existingIndex === -1) {
    return {
      items: sortSosRequests([incoming, ...current]),
      isNew: true,
      record: incoming
    };
  }

  const merged = mergeSingleSosRecord(current[existingIndex]!, incoming);
  const next = current.map((item, idx) => (idx === existingIndex ? merged : item));
  return {
    items: sortSosRequests(next),
    isNew: false,
    record: merged
  };
}

/**
 * Merges a paginated REST snapshot without discarding newer socket events that arrived while the
 * HTTP fetch was in flight.
 */
export function mergeSosAlertSnapshot(
  current: readonly SosRequestRecord[],
  snapshot: readonly SosRequestRecord[],
  options: { replaceAll?: boolean } = {}
): SosRequestRecord[] {
  const byId = new Map<string, SosRequestRecord>();
  if (!options.replaceAll) {
    for (const item of current) {
      byId.set(item.id, item);
    }
  }
  for (const item of snapshot) {
    const prior = byId.get(item.id);
    byId.set(item.id, prior ? mergeSingleSosRecord(prior, item) : item);
  }
  return sortSosRequests([...byId.values()]);
}

/** Builds the MapLibre GeoJSON feature collection for pulsing severity-colored SOS markers. */
export function buildSosAlertsGeoJson(
  requests: readonly SosRequestRecord[],
  selectedId: string | null
): SosAlertsFeatureCollection {
  return {
    type: "FeatureCollection",
    features: requests.map((req) => ({
      type: "Feature",
      id: req.id,
      geometry: {
        type: "Point",
        coordinates: [req.location.lon, req.location.lat]
      },
      properties: {
        id: req.id,
        severity: req.severity,
        color: SOS_SEVERITY_PRESENTATION[req.severity].color,
        isSelected: req.id === selectedId,
        isManual: req.location.isManual,
        status: req.status
      }
    }))
  };
}

function defaultAudioContextFactory(): AlertAudioContextLike | null {
  if (typeof globalThis === "undefined") return null;
  const Ctor = (
    globalThis as unknown as {
      AudioContext?: new () => AlertAudioContextLike;
      webkitAudioContext?: new () => AlertAudioContextLike;
    }
  ).AudioContext ?? (
    globalThis as unknown as {
      webkitAudioContext?: new () => AlertAudioContextLike;
    }
  ).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/**
 * Plays a short severity-graded emergency chime via Web Audio API and closes the `AudioContext`
 * afterwards so repeated alerts never hit browser `AudioContext` instance limits.
 */
export async function playSosAlertSound(
  severity: Severity,
  options: {
    muted?: boolean;
    createContext?: () => AlertAudioContextLike | null;
    scheduleClose?: (fn: () => void, delayMs: number) => void;
  } = {}
): Promise<boolean> {
  if (options.muted) return false;

  try {
    const context = (options.createContext ?? defaultAudioContextFactory)();
    if (!context) return false;

    if (context.state === "suspended" && context.resume) {
      await context.resume();
    }

    const notes = SOS_SEVERITY_PRESENTATION[severity].frequenciesHz;
    const stepSeconds = 0.16;
    const noteDuration = 0.13;
    const baseTime = context.currentTime + 0.01;

    notes.forEach((hz, index) => {
      const start = baseTime + index * stepSeconds;
      const stop = start + noteDuration;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = severity === "high" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(hz, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, stop);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(start);
      osc.stop(stop + 0.01);
    });

    const totalMs = Math.ceil((notes.length * stepSeconds + 0.2) * 1000);
    const schedule = options.scheduleClose ?? ((fn, ms) => setTimeout(fn, ms));
    schedule(() => {
      void context.close?.().catch(() => {});
    }, totalMs);

    return true;
  } catch {
    // Autoplay policies block ungestured audio until first click; fail silently without crashing UI.
    return false;
  }
}
