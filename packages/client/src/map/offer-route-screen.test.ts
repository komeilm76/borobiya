import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachOfferRouteScreen, sampledOfferRoute } from './offer-route-screen';

afterEach(() => vi.unstubAllGlobals());

describe('offer road line above the shared map canvas', () => {
  it('samples very long routes without losing endpoints', () => {
    const points = Array.from({ length: 30_000 }, (_, i) => [i / 100, i / 200] as [number, number]);
    const sampled = sampledOfferRoute(points);
    expect(sampled).toHaveLength(1200);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled.at(-1)).toEqual(points.at(-1));
  });

  it('projects onto one noninteractive SVG and follows camera motion, with cleanup', () => {
    const nodes: Array<{ name: string; attrs: Map<string, string>; children: unknown[]; style: { cssText: string }; remove: ReturnType<typeof vi.fn> }> = [];
    const create = (name: string) => {
      const attrs = new Map<string, string>();
      const node = { name, attrs, children: [] as unknown[], style: { cssText: '' },
        setAttribute: (key: string, value: string) => { attrs.set(key, value); },
        append: (child: unknown) => { node.children.push(child); }, remove: vi.fn() };
      nodes.push(node);
      return node;
    };
    vi.stubGlobal('document', { createElementNS: (_ns: string, name: string) => create(name) });
    let nextFrame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { nextFrame = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const handlers = new Map<string, () => void>();
    let offset = 0;
    const container = { clientWidth: 100, clientHeight: 100, append: vi.fn() };
    const map = { getContainer: () => container,
      project: ([lon, lat]: [number, number]) => ({ x: lon * 10 + offset, y: lat * 10 }),
      on: (event: string, handler: () => void) => { handlers.set(event, handler); },
      off: (event: string) => { handlers.delete(event); } };
    const painted = vi.fn();
    const dispose = attachOfferRouteScreen(map as unknown as Parameters<typeof attachOfferRouteScreen>[0],
      [[1, 2], [4, 5]], painted);
    expect(container.append).toHaveBeenCalledTimes(1);
    expect(nodes[0]?.style.cssText).toContain('pointer-events:none');
    expect(nodes[2]?.attrs.get('d')).toBe('M10.0 20.0 L40.0 50.0');
    expect(painted).toHaveBeenLastCalledWith(true);
    offset = 10;
    handlers.get('move')?.();
    (nextFrame as FrameRequestCallback | null)?.(0);
    expect(nodes[2]?.attrs.get('d')).toBe('M20.0 20.0 L50.0 50.0');
    dispose();
    expect(handlers.size).toBe(0);
    expect(nodes[0]?.remove).toHaveBeenCalledOnce();
  });

  it('visually distinguishes an unavailable road route from a real road line', () => {
    const nodes: Array<{ attrs: Map<string, string> }> = [];
    vi.stubGlobal('document', { createElementNS: () => {
      const attrs = new Map<string, string>();
      const node = { attrs, style: { cssText: '' }, setAttribute: (key: string, value: string) => { attrs.set(key, value); },
        append: vi.fn(), remove: vi.fn() };
      nodes.push(node); return node;
    } });
    const map = { getContainer: () => ({ clientWidth: 100, clientHeight: 100, append: vi.fn() }),
      project: ([lon, lat]: [number, number]) => ({ x: lon, y: lat }),
      on: vi.fn(), off: vi.fn() };
    const dispose = attachOfferRouteScreen(map as unknown as Parameters<typeof attachOfferRouteScreen>[0],
      [[1, 2], [4, 5]], vi.fn(), true);
    expect(nodes[2]?.attrs.get('stroke')).toBe('#aa5a13');
    expect(nodes[2]?.attrs.get('stroke-dasharray')).toBe('8 8');
    dispose();
  });
});
