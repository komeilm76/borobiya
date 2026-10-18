import { cancellationReasonCreateSchema, idSchema, securityQuestionSchema } from "@borobiya/shared";
import { describe, expect, it } from "vitest";
import { cancellationReasonSeeds, securityQuestionSeeds } from "./seed-data";
import {
  DEFAULT_ADMIN_ID,
  DEFAULT_ADMIN_PASSWORD,
  resolveAdminSeedPassword
} from "./seed-config";

describe("database seed data", () => {
  it("defines 15 unique, contract-valid public security questions", () => {
    expect(securityQuestionSeeds).toHaveLength(15);
    expect(new Set(securityQuestionSeeds.map(({ id }) => id)).size).toBe(15);
    expect(new Set(securityQuestionSeeds.map(({ text }) => text)).size).toBe(15);

    for (const question of securityQuestionSeeds) {
      expect(securityQuestionSchema.safeParse(question).success).toBe(true);
    }
  });

  it("defines the 5 requester and 6 rescuer cancellation reasons", () => {
    expect(cancellationReasonSeeds).toHaveLength(11);
    const requesterReasons = cancellationReasonSeeds.filter(({ type }) => type === "requester");
    const rescuerReasons = cancellationReasonSeeds.filter(({ type }) => type === "rescuer");
    expect(requesterReasons.map(({ key }) => key)).toEqual([
      "need_resolved",
      "self_resolved",
      "helped_by_other",
      "mistaken_request",
      "other"
    ]);
    expect(rescuerReasons.map(({ key }) => key)).toEqual([
      "physical_inability",
      "vehicle_breakdown",
      "personal_emergency",
      "lack_of_expertise",
      "unsafe_conditions",
      "other"
    ]);

    const scopedKeys = cancellationReasonSeeds.map(({ type, key }) => `${type}:${key}`);
    expect(new Set(scopedKeys).size).toBe(cancellationReasonSeeds.length);
    expect(new Set(cancellationReasonSeeds.map(({ id }) => id)).size).toBe(cancellationReasonSeeds.length);
    expect(idSchema.safeParse(DEFAULT_ADMIN_ID).success).toBe(true);

    for (const reason of cancellationReasonSeeds) {
      const { id, ...createInput } = reason;
      expect(idSchema.safeParse(id).success).toBe(true);
      expect(cancellationReasonCreateSchema.safeParse(createInput).success).toBe(true);
      expect(reason.isActive).toBe(true);
      expect(reason.requiresCustomText).toBe(reason.key === "other");
    }

  });

  it("does not echo a rejected admin seed password", () => {
    const candidate = "NotStrongButSecret";
    let message = "";
    try {
      resolveAdminSeedPassword({ nodeEnv: "production", adminSeedPassword: candidate });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("ADMIN_SEED_PASSWORD");
    expect(message).not.toContain(candidate);
  });

  it("permits the bootstrap credential only in development/test modes", () => {
    expect(resolveAdminSeedPassword({ nodeEnv: "development" })).toBe(DEFAULT_ADMIN_PASSWORD);
    expect(
      resolveAdminSeedPassword({ nodeEnv: "production", adminSeedPassword: "ChangeMe987!" })
    ).toBe("ChangeMe987!");
    expect(() => resolveAdminSeedPassword({ nodeEnv: "production" })).toThrow(/ADMIN_SEED_PASSWORD/);
    expect(() => resolveAdminSeedPassword({})).toThrow(/ADMIN_SEED_PASSWORD/);
    expect(
      () => resolveAdminSeedPassword({ nodeEnv: "production", adminSeedPassword: DEFAULT_ADMIN_PASSWORD })
    ).toThrow(/ADMIN_SEED_PASSWORD/);
    expect(
      () => resolveAdminSeedPassword({ nodeEnv: "production", adminSeedPassword: "weak" })
    ).toThrow(/ADMIN_SEED_PASSWORD/);
  });
});
