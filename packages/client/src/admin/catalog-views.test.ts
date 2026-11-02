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

  it("distinguishes first-load skeletons, failed reads, empty success and stale rows during refresh", () => {
    for (const [source, rows, colspan] of [[incidents, "types", "6"]] as const) {
      expect(source).toContain(`catalogListPresentation(loading.value, ${rows}.value.length, listError.value)`);
      expect(source).toContain("const loading = ref(true)"); // no empty-state flash before onMounted
      expect(source).toContain('v-progress-linear v-if="listState === \'refreshing\'"');
      expect(source).toContain(':aria-busy="loading"');
      expect(source).toMatch(/<p v-if="listState === 'loading'"[^>]*role="status"/);
      const loadingRow = source.match(/<tr v-if="listState === 'loading'">([\s\S]*?)<\/tr>/)?.[1];
      expect(loadingRow).toContain(`colspan="${colspan}"`);
      expect(loadingRow).toContain('<v-skeleton-loader v-for="row in 3"');
      expect(loadingRow).toContain('aria-hidden="true"');
      const errorRow = source.match(/<tr v-if="listState === 'error'">([\s\S]*?)<\/tr>/)?.[1];
      expect(errorRow).toContain(`colspan="${colspan}"`);
      expect(errorRow).toContain('@click="load"');
      expect(source).toContain('<tr v-if="listState === \'empty\'">');
      expect(source).toContain(`v-for="${rows === "types" ? "type in types" : "category in categories"}"`);
      expect(source).not.toContain(`v-if="!loading && ${rows}.length === 0"`);
      expect(source).toContain('<v-snackbar v-model="successVisible"');
    }
  });

  it("aborts and ignores in-flight work when the page unmounts", () => {
    // Both views fetch on mount and after every write, so a fast unmount would otherwise land a response
    // on a dead component (and, before the version guards, overwrite a newer list with an older one).
    expect(incidents).toContain("onUnmounted(");
    expect(incidents).toContain("?.abort()");
    expect(incidents).toContain("if (version !== requestVersion) return;");
  });
});
