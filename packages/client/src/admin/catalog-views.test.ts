import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The two admin catalog screens are not mounted in tests (no `@vue/test-utils`, no jsdom — see
 * `docs/STRUCTURE.md`), so the rules that live in their markup are checked against their source. These
 * are the four that cannot be expressed anywhere else, each one a decision someone could quietly undo
 * while "improving" the view.
 */
const incidents = readFileSync(new URL("../views/_admin/AdminIncidentsView.vue", import.meta.url), "utf8");

describe("the admin catalog views' load-bearing markup", () => {
  it("refreshes the session before every request, including the writes", () => {
    // A 15-minute access token is shorter than an admin's attention span. Every request in the view goes
    // through `adminToken()`, which calls `auth.ensureSession()`; a call that used `auth.accessToken`
    // directly would work in development and fail with a 401 on the fourth edit of a long session.
    expect(incidents).toContain("await auth.ensureSession()");
    expect(incidents.match(/auth\.accessToken/g)).toHaveLength(1);
    expect(incidents.match(/await adminToken\(\)/g)).toHaveLength(2);
  });

  it("lets an admin rename a slug, because the API does", () => {
    // `PATCH /_admin/incidents/:id` validates and reports slug conflicts, so freezing the field in the
    // edit dialog would be a rule the server does not have. The hint next to it says what a rename costs.
    expect(incidents).toContain('v-model="draft.slug"');
    expect(incidents).toMatch(/v-model="draft\.slug"[\s\S]{0,400}?:disabled="saving"\s*\//);
    expect(incidents).not.toContain("disabled=\"saving || editing !== null\"");
  });

  it("prefers the field error over the server's 400 when a name cannot produce a slug", () => {
    expect(incidents).toContain("slugNeedsManualEntry(draft.value)");
    expect(incidents).toContain("incidentSlugPreview");
  });

  it("distinguishes a first load, a failed read, an empty catalog and a stale list during refresh", () => {
    // The incidents list renders the shared state panel now, decided by the same presentation helper the services
    // list uses — one definition of "empty" for both catalog screens.
    expect(incidents).toContain("catalogListPresentation(loading.value, types.value.length, listError.value, listOffline.value)");
    expect(incidents).toContain("const loading = ref(true)"); // no empty-state flash before onMounted
    expect(incidents).toContain('<AdminStatePanel v-if="listState === \'loading\'" state="loading"');
    expect(incidents).toContain('state="offline"');
    expect(incidents).toContain('state="error"');
    expect(incidents).toContain('state="empty"');
    expect(incidents).toContain('@retry="load"');
    // A refresh keeps the known rows, with a bar rather than skeletons.
    expect(incidents).toContain('v-progress-linear v-if="listState === \'refreshing\'"');
    expect(incidents).toContain(':aria-busy="loading"');
    // A refresh that fails keeps the rows and says they are the last good ones.
    expect(incidents).toContain("فهرست نمایش‌داده‌شده از آخرین دریافت موفق است.");
    expect(incidents).toContain('v-for="type in types"');
    // The old inline rows are gone; the page cannot grow a second dialect of the same state.
    expect(incidents).not.toContain('<tr v-if="listState === \'loading\'">');
    expect(incidents).not.toContain('<tr v-if="listState === \'error\'">');
    expect(incidents).not.toContain('<tr v-if="listState === \'empty\'">');
  });

  it("aborts and ignores in-flight work when the page unmounts", () => {
    // Both views fetch on mount and after every write, so a fast unmount would otherwise land a response
    // on a dead component (and, before the version guards, overwrite a newer list with an older one).
    expect(incidents).toContain("onUnmounted(");
    expect(incidents).toContain("?.abort()");
    expect(incidents).toContain("if (version !== requestVersion) return;");
  });
});
