import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileStyle, compileTemplate, parse } from 'vue/compiler-sfc';

// Source-level contracts only: docs/TASKS.md forbids mounting .vue files in unit tests.
const dispatch = readFileSync(new URL('./AdminDispatchView.vue', import.meta.url), 'utf8');
const { template, styles } = parse(dispatch).descriptor;
const css = styles[0]!.content;
const mapTokens = readFileSync(new URL('../../styles/tailwind.css', import.meta.url), 'utf8');
const travel = readFileSync(new URL('../../components/map/PointRouteSheet.vue', import.meta.url), 'utf8');

const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start) + 1);
};

describe('dispatch controls match the map Mission and Travel design language', () => {
  it('shares the map widget card, corner and depth tiers without flattening dialogs', () => {
    expect(mapTokens).toContain('.v-card.bb-map-navigation-card {');
    expect(travel).toContain('bb-floating-card bb-map-navigation-card');
    expect(template!.content.match(/admin-dispatch__surface[^"\n]*bb-map-navigation-card bb-surface-card/g)).toHaveLength(4);
    expect(rule('.admin-dispatch__surface')).toBe('.admin-dispatch__surface { min-width: 0; }');
    expect(mapTokens).toContain('border-radius: var(--bb-radius-card, 24px) !important;');
    expect(mapTokens).toContain('background: rgba(var(--v-theme-surface), 0.95);');
    expect(mapTokens).toContain('backdrop-filter: blur(12px);');
    expect(mapTokens).toContain('.v-card.bb-surface-card {\n  box-shadow: var(--bb-shadow-surface) !important;');
    expect(rule('.dispatch-request-row, .dispatch-responder-row')).toContain('border-radius: var(--bb-radius-nested, 16px);');
    expect(rule('.admin-dispatch__facts > div')).toContain('border-radius: var(--bb-radius-nested, 16px);');
    expect(css).toContain('box-shadow: var(--bb-shadow-overlay);');
    expect(rule('.map-selected-alert-card')).toContain('width: 44px; height: 44px;');
    expect(rule('.admin-dispatch__search')).toContain('box-shadow: var(--bb-shadow-overlay);');
    expect(css).toContain('.dispatch-map-choices { position: absolute;');
  });

  it('uses the same field treatment, compact filtering, action sizes and Persian font', () => {
    expect(template!.content).toContain('class="admin-dispatch__filter-select"');
    expect(template!.content).toContain('label="فیلتر SOS"');
    expect(template!.content).not.toContain('admin-dispatch__filter-toggle');
    expect(template!.content).toContain('role="group" aria-label="فیلتر وضعیت درخواست‌ها"');
    expect(template!.content).not.toContain('admin-dispatch__toolbar-label');
    expect(template!.content).toContain('rounded="lg"\n            color="primary"\n            hide-details');
    expect(template!.content).toContain('hide-details\n            @update:model-value="onFilterChange"');
    expect(template!.content).toContain('variant="outlined" rounded="lg" color="primary" density="compact"');
    expect(template!.content).toContain('type="submit" color="primary" variant="flat" rounded="lg"');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__toolbar :deep(.v-btn) { height: 38px; min-height: 38px; }');
    expect(css).toContain('min-width: 44px; min-height: 44px; height: auto;');
    expect(css).toContain('font-family: var(--bb-font-family); letter-spacing: normal;');
    expect(css).toContain('.admin-dispatch__sender-id { display: flex; flex-wrap: wrap; align-items: center;');
    expect(css).toContain('.admin-dispatch__search-help summary { padding-block: .55rem; cursor: pointer; min-height: 44px; }');
    expect(template!.content).toContain('class="admin-dispatch__confirmation" rounded="xl"');
    expect(template!.content).toContain('color="error" variant="flat" rounded="lg"');
    expect(compileTemplate({ filename: 'AdminDispatchView.vue', id: 'dispatch-parity', source: template!.content }).errors).toEqual([]);
    const compiled = compileStyle({ filename: 'AdminDispatchView.vue', id: 'dispatch-parity', scoped: true, source: css });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain('.admin-dispatch__surface[data-v-dispatch-parity]');
    expect(compiled.code).toContain('#dispatch-sidebar .admin-dispatch__toolbar[data-v-dispatch-parity] .v-btn');
  });
});
