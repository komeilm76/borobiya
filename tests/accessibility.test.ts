// @vitest-environment node
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { ROOT } from '../src/server/core/config.ts';

const read = (relative: string): Promise<string> => Bun.file(path.join(ROOT, relative)).text();

/** Relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4]
    .map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Reads a hex custom property from a CSS block, tolerating minified short hex values. */
function variable(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})`));
  expect(match, `missing CSS variable ${name}`).toBeTruthy();
  const value = match![1];
  if (value.length === 4) return `#${value.slice(1).split('').map((digit) => digit + digit).join('')}`;
  return value;
}

describe('accessibility contract', () => {
  it('light-theme text and semantic colors meet WCAG AA contrast', async () => {
    const css = await read('public/app.css');
    const start = css.search(/:root\{/);
    const end = css.indexOf(':root[data-theme=', start);
    const root = start >= 0 ? css.slice(start, end > start ? end : undefined) : '';
    expect(root.length, 'light theme token block').toBeGreaterThan(100);
    const surface = variable(root, '--surface');
    for (const name of ['--text', '--muted', '--primary', '--danger', '--success', '--warning', '--info']) {
      const ratio = contrast(variable(root, name), surface);
      expect(ratio, `${name} contrast ${ratio.toFixed(2)} is below 4.5:1`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(variable(root, '--text'), surface)).toBeGreaterThanOrEqual(7);
  });

  it('the HTML shell exposes skip navigation, a focusable landmark and live regions', async () => {
    const html = await read('public/index.html');
    expect(html).toMatch(/class="skip-link" href="#app"/);
    expect(html).toMatch(/id="app"[^>]*tabindex="-1"/);
    expect(html).toMatch(/aria-live="polite"|aria-live="assertive"/);
    expect(html).toMatch(/role="status"/);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    const css = await read('public/app.css');
    expect(css).toMatch(/\.skip-link:focus/);
    expect(css).toMatch(/button:focus-visible/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  it('the Vue router lazy-loads every view and keeps first-paint shells available', async () => {
    const router = await read('src/client/router/index.ts');
    expect(router).not.toMatch(/import \{[\s\S]*?\} from '@\/views\//);
    for (const view of ['LoginView', 'MapView', 'SosView', 'OverviewView', 'DispatchView']) {
      expect(router, view).toContain(`@/views/`);
      expect(router, view).toContain(`${view}.vue`);
    }
    expect(router).toMatch(/createWebHistory/);
    const layouts = await read('src/client/layouts/AdminLayout.vue');
    // The navigation lives in AdminNav (rendered by both the sidebar and the small-screen
    // drawer); the shell keeps the landmarks. Check the pair, not one file.
    const nav = await read('src/client/components/AdminNav.vue');
    expect(nav).toMatch(/aria-current/);
    expect(layouts).toMatch(/<aside/);
  });

  it('loading, offline and command palette affordances are implemented in Vue components', async () => {
    const app = await read('src/client/App.vue');
    expect(app).toMatch(/<CommandPalette \/>/);
    expect(app).toMatch(/<AppToastHost \/>/);
    expect(app).toMatch(/prefers-reduced-motion/);
    const mapLayout = await read('src/client/layouts/MapLayout.vue');
    expect(mapLayout).toMatch(/offline-banner/);
    expect(mapLayout).toMatch(/role="status"/);
    const palette = await read('src/client/components/CommandPalette.vue');
    expect(palette).toMatch(/role="dialog"|aria-label/);
    expect(palette).toMatch(/aria-selected|aria-activedescendant|role="option"/);
    // Filtering can empty the list without any focus change, so the match count needs an
    // announceable live region; otherwise the dialog silently goes blank for a screen reader.
    expect(palette).toMatch(/role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/);
    const paletteLogic = await read('src/client/composables/useCommandPalette.ts');
    expect(paletteLogic).toMatch(/ArrowDown/);
    expect(paletteLogic).toMatch(/ArrowUp/);
    expect(paletteLogic).toMatch(/Home/);
    expect(paletteLogic).toMatch(/End/);
    const css = await read('public/app.css');
    expect(css).toMatch(/is-keyboard-active|focus-visible/);
  });
});
