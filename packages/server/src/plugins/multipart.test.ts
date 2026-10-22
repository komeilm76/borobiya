import { describe, expect, it } from "vitest";
import { MAX_SOS_PHOTO_BYTES } from "@borobiya/shared";
import { multipartLimits } from "./multipart";

/**
 * These numbers are the contract, not tuning: spec §11.2 states 5 MB and one optional photo, and the
 * parser is where an oversized body is refused *before* it is collected. A change here is a change to
 * what a client may send, so it is pinned against the shared constant rather than restated.
 */
describe("multipart parser limits", () => {
  it("caps one file at the photo limit the contract states", () => {
    expect(multipartLimits().fileSize).toBe(MAX_SOS_PHOTO_BYTES);
    expect(multipartLimits().files).toBe(1);
  });

  it("takes the ceiling from configuration, because `SOS_PHOTO_MAX_SIZE_MB` is a real knob", () => {
    expect(multipartLimits(1_048_576).fileSize).toBe(1_048_576);
  });

  it("keeps the metadata a rejected body can carry bounded", () => {
    const limits = multipartLimits();
    expect(limits.fields).toBeLessThanOrEqual(8);
    expect(limits.fieldNameSize).toBeLessThanOrEqual(200);
    expect(limits.fieldSize).toBeLessThanOrEqual(8_192);
  });
});
