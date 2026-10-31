import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(join(src, path), "utf8");
const workspace = read("styles/tailwind.css");

// Style/source checks only. Do not mount .vue components (docs/TASKS.md).
describe("user/admin workspace typography", () => {
  it("caps real page headlines and keeps the shared placeholder in the same scale", () => {
    expect(workspace).toContain("font-size: clamp(1.65rem, 2.5vw, 2.15rem)");
    expect(workspace).toContain("font-size: clamp(1.65rem, 5vw, 2rem)");
    expect(workspace).not.toContain("max-width: 12ch");
    expect(workspace).not.toContain("letter-spacing: -0.045em");
    expect(read("views/_user/UserMissionView.vue")).toContain("clamp(1.65rem, 2.5vw, 2.2rem)");
    expect(read("views/_user/UserRescuerHistoryView.vue")).toContain("clamp(1.55rem,2.5vw,2.15rem)");
    expect(read("views/_user/UserSosHistoryView.vue")).toContain("clamp(1.55rem,2.5vw,2.2rem)");
    const users = read("views/_admin/AdminUsersView.vue");
    expect(users).toContain("clamp(1.5rem, 2.3vw, 1.95rem)");
    expect(users).not.toContain("letter-spacing: -0.035em");
  });

  it("keeps Persian-first type on workspace routes and leaves public/auth routes alone", () => {
    expect(read("App.vue")).toContain("'app-shell--workspace': !isAuthRoute && !isPublicRoute");
    expect(workspace).toContain(".v-application.app-shell--workspace {");
    expect(workspace).toContain(".app-shell--workspace :is(.text-h5, .text-subtitle-1, .text-subtitle-2, .text-body-2, .text-caption)");
    expect(workspace).toContain("letter-spacing: normal !important;");
  });

  it("eliminates illegible explicit sub-0.8rem text across user/admin pages and their widgets", () => {
    const pages = ["views/_user", "views/_admin"];
    const widgets = ["map", "mission", "settings", "sharing", "shell", "sos"].map((group) => `components/${group}`);
    let count = 0;
    for (const directory of [...pages, ...widgets]) {
      for (const name of readdirSync(join(src, directory)).filter((file) => file.endsWith(".vue"))) {
        const path = `${directory}/${name}`;
        const source = read(path);
        for (const match of source.matchAll(/font-size:\s*([\d.]+)rem\b/g)) {
          expect(Number(match[1]), `${path}: ${match[0]}`).toBeGreaterThanOrEqual(0.8);
          count++;
        }
      }
    }
    expect(count).toBeGreaterThan(200);
    const playback = read("components/map/HistoryPlaybackPanel.vue");
    expect(playback).toMatch(/\.history-playback__field input\s*\{[^}]*font-size: 1rem;/);
    expect(read("components/shell/ProposalInboxContent.vue")).toMatch(/\.offers__stat\s*\{[^}]*min-height: 88px;[^}]*font-size: 0.82rem;/);
    // Do not hide map content or shrink the 44px map launchers to fit the larger labels.
    const map = read("views/_user/UserMapView.vue");
    expect(map).toContain("min-height: 44px; height: auto; max-width: 100%;");
    expect(map).toContain("min-width: 44px;");
  });
});
