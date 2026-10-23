import { describe, expect, it } from "vitest";
import { ApiError } from "../api/http";
import type { Category, IncidentType } from "@shared/index";
import {
  categoryCreateBody,
  categoryDraftFromCategory,
  categoryPatchBody,
  EMPTY_INCIDENT_DRAFT,
  incidentCreateBody,
  incidentDraftFromType,
  incidentPatchBody,
  incidentSlugPreview,
  requiredNameError,
  sameIdSet,
  slugConflictTarget,
  slugNeedsManualEntry,
  unknownTargetLabels
} from "./catalog-form";

const INCIDENT: IncidentType = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Flood response",
  slug: "flood-response",
  icon: "mdi-waves",
  color: "#0ea5e9",
  description: "Water rescue and sandbagging.",
  createdAt: "2026-10-22T09:00:00.000Z"
};

const CATEGORY: Category = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "River team",
  description: "Boats and dry suits.",
  incidentTypeIds: [INCIDENT.id],
  createdAt: "2026-10-22T09:00:00.000Z"
};

const incidentDraft = (overrides: Partial<typeof EMPTY_INCIDENT_DRAFT> = {}) => ({
  ...EMPTY_INCIDENT_DRAFT,
  name: "Flood response",
  ...overrides
});

describe("incident create body", () => {
  it("sends the name and a description, and nothing else", () => {
    const result = incidentCreateBody(incidentDraft());

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    // The exact key set is the claim: an empty `slug`, `icon` or `color` would be a `400` from
    // `min(1)` fields, and `""` sent anyway is how a form invents errors the admin never made.
    expect(Object.keys(result.body).sort()).toEqual(["description", "name"]);
    expect(result.body.name).toBe("Flood response");
  });

  it("trims, and keeps an explicitly typed slug", () => {
    const result = incidentCreateBody(incidentDraft({ name: "  Fire  ", slug: " fire-brigade ", icon: "  " }));

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.body).toEqual({ name: "Fire", slug: "fire-brigade", description: "" });
  });

  it("refuses a blank name and a malformed slug in the admin's language, quoting the schema's own bound", () => {
    const blank = incidentCreateBody(incidentDraft({ name: "   " }));
    expect(blank.status).toBe("invalid");
    if (blank.status !== "invalid") return;
    expect(blank.fieldErrors.name).toBe("«نام» نمی‌تواند خالی باشد.");

    const uppercase = incidentCreateBody(incidentDraft({ slug: "Fire-Response" }));
    expect(uppercase.status).toBe("invalid");
    if (uppercase.status !== "invalid") return;
    // No silent lowercasing: the server refuses this slug too, and a form that quietly fixed it would
    // leave the admin holding a rule that does not exist anywhere else.
    expect(uppercase.fieldErrors.slug).toContain("flood-response");

    const long = incidentCreateBody(incidentDraft({ slug: "x".repeat(65) }));
    expect(long.status).toBe("invalid");
    if (long.status !== "invalid") return;
    expect(long.fieldErrors.slug).toContain("64");
  });
});

describe("slug preview", () => {
  it("shows the derived value the server would compute", () => {
    expect(incidentSlugPreview("  Flood response ")).toBe("flood-response");
    expect(incidentSlugPreview("رودخانه")).toBeNull();
  });

  it("asks for a hand-typed slug only when derivation cannot produce one", () => {
    expect(slugNeedsManualEntry(incidentDraft({ name: "رودخانه" }))).toBe(true);
    expect(slugNeedsManualEntry(incidentDraft({ name: "رودخانه", slug: "river" }))).toBe(false);
    expect(slugNeedsManualEntry(incidentDraft({ name: "Flood" }))).toBe(false);
  });
});

describe("incident patch body", () => {
  it("reports no change when nothing moved, so the screen sends nothing", () => {
    expect(incidentPatchBody(INCIDENT, incidentDraftFromType(INCIDENT))).toEqual({ status: "unchanged" });
    // Whitespace is not an edit either; the schema trims, and the store compares trimmed values.
    expect(
      incidentPatchBody(INCIDENT, { ...incidentDraftFromType(INCIDENT), name: "  Flood response  " })
    ).toEqual({ status: "unchanged" });
  });

  it("includes only the changed fields", () => {
    const result = incidentPatchBody(INCIDENT, { ...incidentDraftFromType(INCIDENT), color: "#ef4444" });

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.body).toEqual({ color: "#ef4444" });
  });

  it("clears icon and color with null, because an empty string is a validation error for those two", () => {
    const result = incidentPatchBody(INCIDENT, { ...incidentDraftFromType(INCIDENT), icon: "", color: "" });

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.body).toEqual({ icon: null, color: null });
  });

  it("sends a blank description as the empty string the route folds to NULL itself", () => {
    const result = incidentPatchBody(INCIDENT, { ...incidentDraftFromType(INCIDENT), description: "  " });

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.body).toEqual({ description: "" });
  });

  it("says nothing about fields that were already empty", () => {
    const bare: IncidentType = { ...INCIDENT, icon: null, color: null, description: null };
    expect(incidentPatchBody(bare, incidentDraftFromType(bare))).toEqual({ status: "unchanged" });
  });
});

describe("category bodies", () => {
  it("sends the picked incident types as a de-duplicated set", () => {
    const result = categoryCreateBody({ name: " River team ", description: "", incidentTypeIds: [INCIDENT.id, INCIDENT.id] });

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.body).toEqual({ name: "River team", description: "", incidentTypeIds: [INCIDENT.id] });
  });

  it("treats a reordered selection as no change, because the route replaces the whole set", () => {
    const other = { ...INCIDENT, id: "33333333-3333-4333-8333-333333333333" };
    const original: Category = { ...CATEGORY, incidentTypeIds: [INCIDENT.id, other.id] };
    const draft = { ...categoryDraftFromCategory(original), incidentTypeIds: [other.id, INCIDENT.id] };

    expect(categoryPatchBody(original, draft)).toEqual({ status: "unchanged" });
  });

  it("sends the whole set when one is added or removed", () => {
    const other = { ...INCIDENT, id: "33333333-3333-4333-8333-333333333333" };
    const result = categoryPatchBody(CATEGORY, {
      name: CATEGORY.name,
      description: CATEGORY.description ?? "",
      incidentTypeIds: [other.id]
    });

    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.body).toEqual({ incidentTypeIds: [other.id] });
  });

  it("blocks an empty name before the diff can call it “nothing to save”", () => {
    // A patch builder that dropped the blank field silently would leave the admin staring at a disabled
    // save button with no reason attached, which is indistinguishable from the form being broken.
    expect(requiredNameError("   ")).toBe("«نام» نمی‌تواند خالی باشد.");
    expect(requiredNameError("River team")).toBeNull();
    expect(categoryPatchBody(CATEGORY, { ...categoryDraftFromCategory(CATEGORY), name: "" })).toEqual({
      status: "unchanged"
    });
  });

  it("compares id sets by membership, not by length alone", () => {
    expect(sameIdSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameIdSet(["a", "a"], ["a"])).toBe(true);
    expect(sameIdSet(["a", "b"], ["a", "c"])).toBe(false);
    expect(sameIdSet(["a"], ["a", "a"])).toBe(true);
  });
});

describe("server refusals this screen can name better than the API can", () => {
  it("finds which incident type holds a taken slug", () => {
    const conflict = new ApiError(409, "INCIDENT_TYPE_SLUG_TAKEN", '"Flood response" already uses the slug "flood-response".', [
      { code: "incident_type_slug_taken", message: "…", path: ["slug"], slug: "flood-response" }
    ]);

    expect(slugConflictTarget(conflict, [INCIDENT])?.name).toBe("Flood response");
    // A slug that became taken since this list was loaded has no local owner to name; the caller says so
    // rather than inventing one.
    expect(slugConflictTarget(conflict, [])).toBeNull();
    expect(slugConflictTarget(new ApiError(400, "VALIDATION_ERROR", "no"), [INCIDENT])).toBeNull();
  });

  it("turns refused ids into the names the admin picked, and keeps the raw id when it cannot", () => {
    const names = new Map([[INCIDENT.id, "field_responder"]]);
    const error = new ApiError(400, "VALIDATION_ERROR", "Request body validation failed.", [
      { code: "unknown_target", message: "unknown user", path: ["userIds", 0] },
      { code: "unknown_target", message: "unknown user", path: ["userIds", 1] }
    ]);

    const labels = unknownTargetLabels(error, [INCIDENT.id, "99999999-9999-4999-8999-999999999999"], (id) =>
      names.get(id) ?? null
    );

    expect(labels).toEqual(["field_responder", "99999999-9999-4999-8999-999999999999"]);
    expect(unknownTargetLabels(new ApiError(409, "INCIDENT_TYPE_SLUG_TAKEN", "…"), [], () => null)).toEqual([]);
  });
});
