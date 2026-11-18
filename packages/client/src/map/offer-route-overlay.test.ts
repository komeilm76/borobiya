import { describe, expect, it, vi } from 'vitest';
import { clearOfferRoute, OFFER_CASING, OFFER_LAYER, OFFER_SOURCE, paintOfferRoute } from './offer-route-overlay';

const data = { type: 'FeatureCollection' as const, features: [{
  type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const,
    coordinates: [[51.1, 35.1], [51.2, 35.2]] as [number, number][] }
}] };

function fixture() {
  let ready = false;
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Set<string>();
  const map = {
    // Tiles may remain pending indefinitely even though a style accepts an overlay.
    isStyleLoaded: () => false,
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.has(id) ? { id } : undefined,
    addSource: (id: string) => {
      if (!ready) throw new Error('Style is not done loading');
      sources.set(id, { setData: vi.fn() });
    },
    addLayer: ({ id }: { id: string }) => { if (!ready) throw new Error('Style is not done loading'); layers.add(id); },
    removeLayer: (id: string) => { layers.delete(id); },
    removeSource: (id: string) => { sources.delete(id); }
  };
  return { map: map as unknown as Parameters<typeof paintOfferRoute>[0], sources, layers, ready: () => { ready = true; } };
}

describe('selected mission offer route on the shared map', () => {
  it('retries while a style is loading, then paints on top despite pending tiles', () => {
    const { map, sources, layers, ready } = fixture();
    expect(paintOfferRoute(map, data)).toBe(false);
    ready();
    expect(paintOfferRoute(map, data)).toBe(true);
    expect(sources.has(OFFER_SOURCE)).toBe(true);
    expect(layers.has(OFFER_CASING)).toBe(true);
    expect(layers.has(OFFER_LAYER)).toBe(true);
    expect(paintOfferRoute(map, data)).toBe(true); // no redundant setData/idle loop
    expect(sources.get(OFFER_SOURCE)?.setData).not.toHaveBeenCalled();
  });

  it('restores after a style replacement and removes only offer-owned overlays on close', () => {
    const { map, sources, layers, ready } = fixture();
    ready();
    paintOfferRoute(map, data);
    sources.clear(); layers.clear(); // MapLibre setStyle removed custom layers.
    expect(paintOfferRoute(map, data)).toBe(true);
    clearOfferRoute(map);
    expect(sources.size).toBe(0);
    expect(layers.size).toBe(0);
  });
});
