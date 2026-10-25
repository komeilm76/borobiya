import { describe, expect, it } from "vitest";
import { apiRoutes } from "../api";
import {
  cancellationReasonCreateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  createAdminUserSchema,
  createUserSchema
} from "./admin";
import {
  dispatchResponseSchema,
  dispatchSchema,
  missionRatingSchema,
  nearestResponderSchema,
  nearestRespondersResponseSchema,
  sosProposalReceivedEventSchema,
  sosRequestSchema
} from "./sos";

const id1 = "00000000-0000-4000-8000-000000000020";
const id2 = "00000000-0000-4000-8000-000000000021";

describe("SOS and admin schemas", () => {
  it("validates a bounded username search on the admin-only nearest-responder route", () => {
    const query = apiRoutes.admin.getNearestResponders.schema.query;
    expect(query.parse({ search: "  rescue_far  " })).toEqual({ search: "rescue_far" });
    expect(query.safeParse({ search: "r" }).success).toBe(false);
    expect(query.safeParse({ search: "r".repeat(65) }).success).toBe(false);
    expect(query.safeParse({ search: "rescue", extra: "yes" }).success).toBe(false);
  });
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
    expect(createAdminUserSchema.safeParse({
      username: "new_user",
      password: "admin1234",
      isActive: false
    }).success).toBe(true);
    expect(createAdminUserSchema.safeParse({
      username: "new_user",
      password: "admin1234",
      securityQuestions: []
    }).success).toBe(false);
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

  it("validates nearest responder suggestions, dispatch responses, and proposal events", () => {
    const responder = {
      userId: id1,
      username: "rescuer_01",
      distance: 425.7,
      avgRating: 4.8,
      categoryName: "امداد کوهستان",
      lastActiveAt: "2026-10-23T12:00:00.000Z"
    };
    expect(nearestResponderSchema.safeParse(responder).success).toBe(true);
    expect(nearestResponderSchema.safeParse({ ...responder, distance: -1 }).success).toBe(false);
    expect(nearestResponderSchema.safeParse({ ...responder, avgRating: 5.5 }).success).toBe(false);
    expect(nearestRespondersResponseSchema.safeParse({ responders: [responder] }).success).toBe(true);

    const proposal = {
      id: id2,
      sosRequestId: id1,
      rescuerId: id2,
      status: "pending" as const,
      createdAt: "2026-10-23T12:01:00.000Z"
    };
    expect(dispatchResponseSchema.safeParse({ proposals: [proposal] }).success).toBe(true);
    expect(
      sosProposalReceivedEventSchema.safeParse({
        proposal,
        sosRequest: {
          id: id1,
          requesterId: id1,
          severity: "high",
          description: "Vehicle accident; assistance requested.",
          incidentTypeId: id2,
          location: { lat: 35.7, lon: 51.4, accuracy: 8, isManual: false },
          photoUrl: null,
          status: "dispatched",
          cancellationReasonId: null,
          cancellationCustomText: null,
          cancelledAt: null,
          createdAt: "2026-10-23T12:00:00.000Z"
        }
      }).success
    ).toBe(true);
  });
});
