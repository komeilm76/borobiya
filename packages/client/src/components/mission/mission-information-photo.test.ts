import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileStyle, compileTemplate, parse } from 'vue/compiler-sfc';

const source = readFileSync(new URL('./MissionBriefDetails.vue', import.meta.url), 'utf8');
const { template, styles } = parse(source).descriptor;
const css = styles[0]!.content;

// Photo access and panel appearance contracts; never mount Vue SFCs (docs/TASKS.md).
describe('compact mission information and photo viewer', () => {
  it('shows each incident fact only once and reveals the original text without duplicating it', () => {
    expect(template!.content.match(/{{ address }}/g)).toHaveLength(1);
    expect(template!.content.match(/brief.description/g)).toHaveLength(1);
    expect(template!.content.match(/brief.requesterName/g)).toHaveLength(1);
    expect(template!.content).toContain('<details class="mission-brief__details">');
    expect(template!.content).toContain('مختصات ثبت‌شدهٔ حادثه');
    expect(template!.content).toContain('aria-label="کپی شناسهٔ کامل مأموریت"');
    expect(css).toContain('.mission-brief:has(.mission-brief__details[open]) .mission-brief__address-preview,');
    expect(compileTemplate({ filename: 'MissionBriefDetails.vue', id: 'info-photo', source: template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: 'MissionBriefDetails.vue', id: 'info-photo', scoped: true, source: css }).errors).toEqual([]);
  });

  it('opens a cover-cropped thumbnail into a contain-fit, closable full-size dialog', () => {
    expect(template!.content).toContain('v-if="brief.hasPhoto && photoSrc" ref="photoButton" class="mission-brief__photo" type="button"');
    expect(template!.content).toContain('aria-label="نمایش تصویر حادثه در اندازهٔ بزرگ" :disabled="photoOpening" @click="openPhoto"');
    expect(source).toContain('Date.now() - photoLoadedAt.value > 45_000');
    expect(source).toContain('current === generation && missionId === props.missionId && props.visible');
    expect(css).toContain('.mission-brief__photo img { display: block; width: 100%; height: 100%; object-fit: cover; }');
    expect(template!.content).toContain('<v-dialog :model-value="photoOpen && !!photoSrc"');
    expect(template!.content).toContain('aria-label="بستن تصویر حادثه" @click="closePhoto"');
    expect(css).toContain('width: auto; height: auto; object-fit: contain;');
    expect(source).toContain('photoOpen.value = false;');
    expect(source).toContain('photoButton.value?.focus({ preventScroll: true })');
    expect(template!.content).not.toContain('mission-brief__photo-full');
    expect(source).toContain('current === generation && props.visible && auth.user?.id === owner && auth.accessToken === token');
    expect(source).toContain('دسترسی به تصویر پایان یافت؛ دوباره دریافت کنید.');
  });
});
