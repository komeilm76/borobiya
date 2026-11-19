import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileStyle, parse } from 'vue/compiler-sfc';

const inbox = readFileSync(new URL('../shell/ProposalInboxContent.vue', import.meta.url), 'utf8');
const mission = readFileSync(new URL('../../views/_user/UserMissionView.vue', import.meta.url), 'utf8');
const map = readFileSync(new URL('../../views/_user/UserMapView.vue', import.meta.url), 'utf8');

// Source contracts; Vue SFCs must not be mounted in unit tests (docs/TASKS.md).
describe('pending mission offer map preview', () => {
  it('reuses the authenticated shared map and fresh private GPS without starting a second watcher or guidance', () => {
    expect(map).toContain(':own-position="own.position.value"');
    expect(map).toContain('user-map-view--mission-offer-preview');
    expect(map).toContain('.user-map-view--mission-offer-preview .user-map-view__search { display: none !important; }');
    expect(mission).toContain("@request-location=\"emit('focus-own')\"");
    expect(mission).toContain(':map="externalMap"');
    expect(inbox).toContain("getMissionRouteChoices(previewOrigin.value, target, 'car', controller.signal)");
    expect(inbox).toContain('useMissionRouteGeometry(previewRoute)');
    expect(inbox).toContain('paintOfferRoute(map, previewGeometry.value.data)');
    expect(inbox).toContain("map.on('styledata', paint)");
    expect(inbox).toContain("map.on('idle', paint)");
    expect(inbox).toContain("map.off('styledata', paint)");
    expect(inbox).toContain("map.off('idle', paint)");
    expect(inbox).toContain('clearOfferRoute(map)');
    expect(inbox).toContain('onCleanup(() => controller.abort())');
    expect(inbox).toContain('() => auth.user?.id');
    expect(inbox).toContain('() => Boolean(props.ownPosition)');
    expect(inbox).toContain("const offerForPreview = computed(() => props.compactMap && props.visible && detailOpen.value ? selected.value : null)");
    expect(inbox).not.toContain('new maplibregl.Map(');
  });

  it('names the incident and optional manual origin beside their real pins through camera changes', () => {
    expect(inbox).toContain("createMapPointElement('sos', 'محل حادثهٔ پیشنهاد انتخاب‌شده', { caption: 'حادثه' })");
    expect(inbox).toContain("createMapPointElement('start', 'مبدأ انتخاب‌شده برای پیش‌نمایش؛ نه موقعیت زنده',");
    expect(inbox).toContain("{ caption: 'مبدأ انتخابی' }");
    expect(inbox).toContain("anchor: 'center'");
    expect(inbox).toContain('positionMapPointLabels(map, [marker, originMarker])');
    for (const event of ['move', 'moveend', 'resize']) {
      expect(inbox).toContain(`map.on('${event}', onCameraFrame)`);
      expect(inbox).toContain(`map.off('${event}', onCameraFrame)`);
    }
    expect(inbox).not.toContain("new MarkerClass({ color: '#cc623f' })");
  });

  it('shows a road ETA and distance side by side only on a verified route, with honest no-GPS/no-address states', () => {
    expect(inbox).toContain("reversePlace({ lat: target.lat, lon: target.lon }, controller.signal)");
    expect(inbox).toContain("address.value = result?.formattedAddress ?? null");
    expect(inbox).toContain('نشانی مشخصی برای این نقطه پیدا نشد.');
    expect(inbox).toContain("previewRoute ? formatRouteDistance(previewRoute.distance_m) : '—'");
    expect(inbox).toContain("previewCalculatedAt + previewRoute.duration_s * 1000");
    expect(inbox).toContain('زمان تقریبی و بدون ترافیک است.');
    expect(inbox).toContain('موقعیت GPS تازه یا یک مبدأ انتخابی لازم است.');
    expect(inbox).toContain('خط‌چین روی نقشه تنها جهت مستقیم تا حادثه را نشان می‌دهد؛ مسیر جاده نیست.');
    expect(inbox).toContain('attachOfferRouteScreen(map, linePoints');
    expect(inbox).toContain('offerCameraPadding(mapRect, panelRect)');
    expect(inbox).toContain('map.getContainer().getBoundingClientRect()');
    expect(inbox).toContain('manualOrigin, routeAttempt, () => auth.user?.id');
    expect(inbox).toContain("map.on('click', onPick)");
    expect(inbox).toContain("map.off('click', onPick)");
    expect(inbox).toContain("previewError.value = 'مسیر خودرو در دسترس نیست؛ فاصله و زمان قابل برآورد نیست.'");
    expect(inbox).toContain('.offer-detail__metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('keeps the parent list scroll inside the card and clears map area on phone and desktop', () => {
    expect(mission).toContain("'mission-desk__empty--preview': offerDetailOpen");
    expect(mission).not.toContain('--offer-list-height');
    expect(mission).toContain('height: auto; display: flex; flex-direction: column; overflow: hidden;');
    expect(mission).toContain('--offer-list-max-height: max(3rem, calc(100dvh - 19rem');
    expect(mission).toContain('.mission-desk__empty--preview {\n    position: absolute;');
    expect(mission).toContain('@media (min-width: 1024px) {\n  .mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty--preview');
    expect(inbox).toContain('.offers--map .offers__list, .offers--map .offer-detail { min-height: 0; overflow-y: auto;');
    expect(inbox).toContain('.offers--map:not(.offers--detail-open) .offers__list { max-height: var(--offer-list-max-height); overflow-y: auto; scrollbar-gutter: auto; }');
    expect(inbox).toContain('.offers--map .offers__items { max-height: none; overflow: visible; padding: 0; }');
    for (const [source, filename] of [[inbox, 'ProposalInboxContent.vue'], [mission, 'UserMissionView.vue']] as const) {
      const css = parse(source, { filename }).descriptor.styles[0]!.content;
      expect(compileStyle({ source: css, filename, id: 'data-v-offer-preview', scoped: true }).errors).toEqual([]);
    }
  });
});
