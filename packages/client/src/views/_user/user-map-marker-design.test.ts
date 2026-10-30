import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Source and compiled-style checks; docs/TASKS.md prohibits mounting .vue components in unit tests.
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const { descriptor } = parse(view, { filename: "UserMapView.vue" });
const compiled = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-marker-design", scoped: true });

function body(name: string): string {
  const start = view.indexOf(`function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = view.indexOf("\nfunction ", start + 1);
  return view.slice(start, end < 0 ? view.length : end);
}
function rule(selector: string): string {
  const css = descriptor.styles[0]!.content.replace(/\/\*[\s\S]*?\*\//g, "");
  const match = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find((block) => block[1]!.split(",").map((part) => part.trim()).includes(selector));
  expect(match, selector).toBeDefined();
  return match![2]!;
}

describe("own and companion marker design", () => {
  it("keeps the companion avatar smaller while retaining its keyboard and 44px touch target", () => {
    const marker = body("syncPeerAvatars");
    expect(marker).toContain('button.type = "button"');
    expect(marker).toContain('button.setAttribute("aria-haspopup", "dialog")');
    expect(marker).toContain('avatar.className = "user-map-view__peer-avatar-face"');
    expect(marker).toContain('face.textContent = avatarInitial(peer.name)');
    expect(marker).toContain('button.append(avatar)');
    expect(marker).not.toContain('button.textContent = avatarInitial(peer.name)');
    expect(rule(":global(.user-map-view .user-map-view__peer-avatar)")).toMatch(/width: 44px; height: 44px;/);
    expect(rule(":global(.user-map-view .user-map-view__peer-avatar-face)")).toMatch(/width: 32px; height: 32px;/);
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain(".user-map-view__peer-avatar-face");
  });

  it("uses an independent, recognizable private GPS icon instead of the POI's default pin", () => {
    const own = body("syncOwnMarker");
    expect(own).toContain('document.createElement("div")');
    expect(own).toContain('element.className = "user-map-view__own-marker"');
    expect(own).toContain('element.setAttribute("role", "img")');
    expect(own).toContain('element.setAttribute("aria-label", "موقعیت زندهٔ من")');
    expect(own).toContain('icon.className = "mdi mdi-crosshairs-gps user-map-view__own-marker-icon"');
    expect(own).toContain('new markerConstructor({ element, anchor: "center" })');
    expect(own).toContain('ownMarker.setLngLat([fix.lon, fix.lat])');
    expect(own).not.toContain('new markerConstructor({ color:');
    expect(body("syncSelectedPlaceMarker")).toContain('new markerConstructor({ color: "#7c3aed" })');
    expect(body("onMapReady")).toContain('ownMarker?.remove(); ownMarker = null;');
    expect(rule(":global(.user-map-view .user-map-view__own-marker)")).toContain("width: 48px; height: 48px;");
    expect(rule(":global(.user-map-view .user-map-view__own-marker-icon)")).toContain("background: #2563eb;");
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain(".user-map-view__own-marker-icon");
  });
});
