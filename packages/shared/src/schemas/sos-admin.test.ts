import { describe, expect, it } from "vitest";
import { cancellationReasonCreateSchema, categoryCreateSchema, categoryUpdateSchema, createUserSchema } from "./admin";
import { dispatchSchema, missionRatingSchema, sosRequestSchema } from "./sos";

const id1 = "00000000-0000-4000-8000-000000000020";
const id2 = "00000000-0000-4000-8000-000000000021";

describe("SOS and admin schemas", () => {
  it("validates SOS description, location, and incident reference", () => {
    const valid = {
      severity: "high",
      description: "Vehicle accident; assistance requested.",
      incidentTypeId: id1,
      location: { lat: 35.7, lon: 51.4, isManual: false }
    };
    expect(sosRequestSchema.safeParse(valid).success).toBe(true);
    expect(sosRequestSchema.safeParse({ ...valid, description: "short" }).success).toBe(false);
    expect(sosRequestSchema.safeParse({ ...valid, location: { ...valid.location, lon: 181 } }).success).toBe(false);
  });

  it("requires a non-empty list of unique dispatch recipients", () => {
    expect(dispatchSchema.safeParse({ rescuerIds: [id1, id2] }).success).toBe(true);
    expect(dispatchSchema.safeParse({ rescuerIds: [] }).success).toBe(false);
    expect(dispatchSchema.safeParse({ rescuerIds: [id1, id1] }).success).toBe(false);
  });

  it("validates rating bounds and admin-created account policy", () => {
    expect(missionRatingSchema.safeParse({ rating: 5 }).success).toBe(true);
    expect(missionRatingSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(createUserSchema.safeParse({ username: "admin_user", password: "admin1234" }).success).toBe(true);
    expect(createUserSchema.safeParse({ username: "admin_user", password: "weak" }).success).toBe(false);
  });

  it("rejects duplicate IDs and empty category patches", () => {
    expect(categoryCreateSchema.safeParse({ name: "Medical", incidentTypeIds: [id1, id2] }).success).toBe(true);
    expect(categoryCreateSchema.safeParse({ name: "Medical", incidentTypeIds: [id1, id1] }).success).toBe(false);
    expect(categoryUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("validates cancellation-reason type and key", () => {
    const valid = {
      type: "rescuer",
      key: "physical_inability",
      label: "Physical inability",
      labelFa: "عدم توانایی جسمی",
      requiresCustomText: false,
      isActive: true
    };
    expect(cancellationReasonCreateSchema.safeParse(valid).success).toBe(true);
    expect(cancellationReasonCreateSchema.safeParse({ ...valid, key: "Invalid Key" }).success).toBe(false);
  });
});
