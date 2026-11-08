/**
 * Global Vitest setup. `happy-dom` backs the component, composable and store suites; server,
 * realtime, script and architecture suites declare `// @vitest-environment node` and therefore
 * skip the DOM patches below.
 */
import { config } from '@vue/test-utils';
import { vi } from 'vitest';

// Vue Test Utils keeps real transitions disabled so component tests never depend on timing.
config.global.stubs = { transition: false, 'transition-group': false };

/** True when a browser-like global is available in the current environment. */
const hasWindow = typeof window !== 'undefined';

if (hasWindow) {
  // happy-dom does not implement `matchMedia` change events; VueUse media queries read them.
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      })
    });
  }
  if (!window.scrollTo) window.scrollTo = (() => undefined) as typeof window.scrollTo;
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 0)) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((handle: number) => clearTimeout(handle)) as typeof window.cancelAnimationFrame;
  }
}
