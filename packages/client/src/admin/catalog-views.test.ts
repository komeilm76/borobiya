import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The two admin catalog screens are not mounted in tests (no `@vue/test-utils`, no jsdom — see
 * `docs/STRUCTURE.md`), so the rules that live in their markup are checked against their source. These
 * are the four that cannot be expressed anywhere else, each one a decision someone could quietly undo
 * while "improving" the view.
 */
const incidents = readFileSync(new URL("../views/_admin/AdminIncidentsView.vue", import.meta.url), "utf8");
const categories = readFileSync(new URL("../views/_admin/AdminCategoriesView.vue", import.meta.url), "utf8");

describe("the admin catalog views' load-bearing markup", () => {
  it("refreshes the session before every request, including the writes", () => {
    // A 15-minute access token is shorter than an admin's attention span. Every request in both views goes
    // through `adminToken()`, which calls `auth.ensureSession()`; a call that used `auth.accessToken`
    // directly would work in development and fail with a 401 on the fourth edit of a long session.
    for (const source of [incidents, categories]) {
      expect(source).toContain("await auth.ensureSession()");
      expect(source.match(/auth\.accessToken/g)).toHaveLength(1);
    }
    expect(incidents.match(/await adminToken\(\)/g)).toHaveLength(2);
    expect(categories.match(/await adminToken\(\)/g)).toHaveLength(4);
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

  it("does not offer to remove a member it cannot list", () => {
    // `categorySchema` carries `incidentTypeIds` and no member list, so there is no way to show who is
    // already in a group, and a remove control would need a uuid typed by hand. The note in the dialog and
    // the absence of the DELETE call are one decision; T3.1.4's membership projection adds both.
    expect(categories).toContain("افزودن عضو");
    expect(categories).not.toContain("removeCategoryUser");
    expect(categories).not.toContain("data-test=\"member-id\"");
    // One text field in that dialog, and it is the username search.
    const dialog = categories.slice(categories.indexOf("v-model=\"membersOpen\""), categories.indexOf("<v-snackbar"));
    expect(dialog.match(/<v-text-field/g)).toHaveLength(1);
    expect(dialog).toContain('data-test="member-search"');
  });

  it("names a refused user rather than the index the server pointed at", () => {
    // `unknown_target` issues carry `path: ["userIds", 2]`; the screen turns that back into the username
    // it offered, which is the only entity name the admin has ever seen.
    expect(categories).toContain("unknownTargetLabels(error, selectedIds.value");
  });

  it("aborts and ignores in-flight work when the page unmounts", () => {
    // Both views fetch on mount and after every write, so a fast unmount would otherwise land a response
    // on a dead component (and, before the version guards, overwrite a newer list with an older one).
    for (const source of [incidents, categories]) {
      expect(source).toContain("onUnmounted(");
      expect(source).toContain("?.abort()");
      expect(source).toContain("if (version !== requestVersion) return;");
    }
  });
});
