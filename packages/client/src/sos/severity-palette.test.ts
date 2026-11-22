import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, compileStyle, compileTemplate } from "vue/compiler-sfc";
import { SOS_PRIORITY_PALETTE, sosPriorityStyle } from "./severity-palette";
import { SOS_SEVERITY_OPTIONS } from "./sos-form";
import { proposalSeverity } from "./proposal-presentation";
import { SOS_MAP_MARKER_COLORS, SOS_SEVERITY_PRESENTATION } from "@/admin/sos-alerts";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const dispatch = source("../views/_admin/AdminDispatchView.vue");
const offers = source("../components/shell/ProposalInboxContent.vue");
const sidebar = source("../components/shell/MapProposalSidebar.vue");

function contrast(first: string, second: string): number {
  const luminance = (hex: string) => {
    const values = [1, 3, 5].map((i) => {
      const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return values[0]! * .2126 + values[1]! * .7152 + values[2]! * .0722;
  };
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light! + .05) / (dark! + .05);
}

describe("SOS severity language across all surfaces", () => {
  it("uses one accent in the SOS form, queue, and map; both chip themes have readable labels", () => {
    for (const severity of ["high", "medium", "low"] as const) {
      const palette = SOS_PRIORITY_PALETTE[severity];
      expect(SOS_SEVERITY_OPTIONS.find((item) => item.value === severity)?.hex).toBe(palette.accent);
      expect(SOS_SEVERITY_PRESENTATION[severity].color).toBe(palette.accent);
      expect(SOS_MAP_MARKER_COLORS[severity]).toBe(palette.accent);
      expect(sosPriorityStyle(severity)["--sos-priority-accent"]).toBe(palette.accent);
      expect(contrast(palette.accent, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.ink, palette.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.darkInk, palette.darkSurface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(proposalSeverity.medium.label).toBe("متوسط");
    expect(proposalSeverity.low.label).toBe("کم‌خطر");
  });

  it("groups queue title/priority, status, and evidence separately without a rainbow of status chips", () => {
    const template = parse(dispatch).descriptor.template!.content;
    const queue = template.slice(template.indexOf('id="dispatch-list-02"'), template.indexOf('</v-list>', template.indexOf('id="dispatch-list-02"')));
    expect(queue).toContain(':style="sosPriorityStyle(item.severity)"');
    expect(queue).toContain('dispatch-request-row__priority');
    expect(queue).toContain('dispatch-request-row__status');
    expect(queue).toContain('dispatch-request-row__meta');
    expect(queue).toContain(':aria-pressed="item.id === adminSos.selectedId"');
    expect(queue).toContain('statusMeta(item.status).queueLabel');
    expect(queue).not.toContain(':color="statusMeta(item.status).badgeColor"');
    expect(queue).not.toContain('variant="flat"');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "priority-queue", source: template }).errors).toEqual([]);
  });

  it("applies that same palette to compact and full responder offers in both themes", () => {
    expect(offers).toContain(':style="sosPriorityStyle(offer.details?.sosRequest.severity ?? \'medium\')"');
    expect(offers).toContain(':style="sosPriorityStyle(selected.details?.sosRequest.severity ?? \'medium\')"');
    expect(sidebar).toContain(':style="sosPriorityStyle(offer.details?.sosRequest.severity ?? \'medium\')"');
    for (const [filename, view] of [["AdminDispatchView.vue", dispatch], ["ProposalInboxContent.vue", offers], ["MapProposalSidebar.vue", sidebar]]) {
      const { styles } = parse(view).descriptor;
      expect(compileStyle({ filename, id: "priority-palette", scoped: true, source: styles[0]!.content }).errors).toEqual([]);
      expect(styles[0]!.content).toContain('var(--sos-priority-dark-ink)');
      expect(styles[0]!.content).toContain('var(--sos-priority-dark-surface)');
    }
  });
});
