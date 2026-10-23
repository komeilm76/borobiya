import { describe, expect, it } from "vitest";
import {
  deriveIncidentSlug,
  incidentSlugValueSchema,
  incidentTypeCreateSchema,
  incidentTypeUpdateSchema,
  resolveIncidentSlug
} from "./admin";

describe("incident slug derivation", () => {
  it("turns the name an admin typed into the identifier a client hardcodes", () => {
    expect(deriveIncidentSlug("  Mountain Rescue! ")).toBe("mountain-rescue");
    expect(deriveIncidentSlug("Fire")).toBe("fire");
    expect(deriveIncidentSlug("CBRN — decon")).toBe("cbrn-decon");
    // Accents fold rather than vanish: "Médical" is a name an admin will type, and dropping the letter
    // would collide it with "M_dical" rather than with the medical type it means.
    expect(deriveIncidentSlug("Médical")).toBe("medical");
    // Two spellings of one name must produce one slug: that collision is the point, and the unique index
    // on `incident_types.slug` is what refuses it.
    expect(deriveIncidentSlug("Road Traffic Accident")).toBe(deriveIncidentSlug("road  traffic/accident"));
  });

  it("refuses to invent a slug for a name it cannot read", () => {
    // A Persian-only label is ordinary in this app, and there is no Latin root to transliterate from.
    expect(deriveIncidentSlug("سیل")).toBeNull();
    expect(deriveIncidentSlug("!!! ???")).toBeNull();
    expect(deriveIncidentSlug("")).toBeNull();
    // A 64-character cap keeps the value usable in a URL and out of Postgres' name-truncation territory.
    expect(deriveIncidentSlug("a".repeat(64))).toBe("a".repeat(64));
    expect(deriveIncidentSlug("a".repeat(65))).toBeNull();
  });

  it("prefers an explicit slug, which is the only way to name what derivation cannot handle", () => {
    expect(resolveIncidentSlug({ name: "سیل", slug: "flood" })).toBe("flood");
    expect(resolveIncidentSlug({ name: "Fire", slug: "fire" })).toBe("fire");
    // Explicit still has to satisfy the shape, so an admin cannot smuggle "Fire Response" through.
    expect(resolveIncidentSlug({ name: "Fire", slug: "Fire Response" })).toBeNull();
    // Whitespace-padded but valid, and stored trimmed: the slug is what a URL carries.
    expect(resolveIncidentSlug({ name: "Fire", slug: " fire-1 " })).toBe("fire-1");
    expect(resolveIncidentSlug({ name: "Fire", slug: "" })).toBe("fire");
    expect(resolveIncidentSlug({ name: "", slug: "" })).toBeNull();
  });

  it("bounds an explicit slug the same way the derivation is bounded", () => {
    // The asymmetry this closes: a 70-character name was refused because its derived slug would not fit, while
    // the identical string sent as `slug` went straight into the table. One schema, both directions — the
    // response payload uses the same schema, so a stored value can never outgrow what a read will serialize.
    expect(incidentSlugValueSchema.safeParse("f".repeat(64)).success).toBe(true);
    expect(incidentSlugValueSchema.safeParse("f".repeat(65)).success).toBe(false);
    expect(incidentTypeCreateSchema.safeParse({ name: "Flood", slug: "f".repeat(65) }).success).toBe(false);
    expect(incidentTypeUpdateSchema.safeParse({ slug: "f".repeat(65) }).success).toBe(false);
    expect(deriveIncidentSlug("f".repeat(70))).toBeNull();
    // One character is legal, in both directions: the floor is the pattern's, not an invented minimum.
    expect(incidentSlugValueSchema.safeParse("0").success).toBe(true);
    expect(deriveIncidentSlug("0")).toBe("0");
  });

  it("keeps the slug pattern the table's unique index and any URL share", () => {
    for (const valid of ["fire", "flood-response", "cbrn-decon", "a1", "0"]) {
      expect(incidentSlugValueSchema.safeParse(valid).success, valid).toBe(true);
    }
    for (const invalid of ["Fire", "fire_response", "-fire", "fire-", "fire--response", "fire ", ""]) {
      expect(incidentSlugValueSchema.safeParse(invalid).success, invalid).toBe(false);
    }
  });
});

describe("incident type create and update bodies", () => {
  it("accepts a name alone and nothing it has not declared", () => {
    expect(incidentTypeCreateSchema.safeParse({ name: "Fire" }).data).toEqual({ name: "Fire" });
    expect(incidentTypeCreateSchema.safeParse({}).success).toBe(false);
    expect(incidentTypeCreateSchema.safeParse({ name: "Fire", isOfficial: true }).success).toBe(false);
    expect(incidentTypeCreateSchema.safeParse({ name: "   " }).success).toBe(false);
    // A slug the admin chose is part of the body contract too, and must already be in shape.
    expect(incidentTypeCreateSchema.safeParse({ name: "سیل", slug: "flood" }).success).toBe(true);
    expect(incidentTypeCreateSchema.safeParse({ name: "Fire", slug: "Fire" }).success).toBe(false);
  });

  it("treats a PATCH as a partial, not as a second create", () => {
    // The bug this pins: `.extend()` keeps the parent's required keys, so a PATCH built that way would
    // have demanded `name` on a request that only changes a color.
    expect(incidentTypeUpdateSchema.safeParse({ color: null }).success).toBe(true);
    expect(incidentTypeUpdateSchema.safeParse({ description: "notes" }).success).toBe(true);
    expect(incidentTypeUpdateSchema.safeParse({ slug: "flood" }).success).toBe(true);
    expect(incidentTypeUpdateSchema.safeParse({}).success).toBe(false);
    expect(incidentTypeUpdateSchema.safeParse({ name: "x", note: "y" }).success).toBe(false);
  });

  it("clears decoration with null, and only with null", () => {
    expect(incidentTypeUpdateSchema.safeParse({ icon: "cross", color: "#f00" }).success).toBe(true);
    expect(incidentTypeUpdateSchema.safeParse({ icon: null }).success).toBe(true);
    expect(incidentTypeUpdateSchema.safeParse({ icon: "" }).success).toBe(false);
    // `description` has no minimum in create, so a blank one is legal input and the route folds it to NULL.
    expect(incidentTypeCreateSchema.safeParse({ name: "Fire", description: "" }).success).toBe(true);
    expect(incidentTypeUpdateSchema.safeParse({ description: null }).success).toBe(true);
  });
});
