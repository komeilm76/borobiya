import { describe, expect, it } from "vitest";
import { safeMigrationErrorDetails } from "./migration-error";

describe("safe migration error diagnostics", () => {
  it("keeps the SQLSTATE and cause while redacting the database URL", () => {
    const databaseUrl = "postgresql://borobiya:secret-token@postgres:5432/borobiya";
    const databaseError = Object.assign(
      new Error(`password authentication failed for user \"borobiya\" (${databaseUrl})`),
      { code: "28P01" }
    );
    const error = new Error("migration runner failed", { cause: databaseError });

    const details = safeMigrationErrorDetails(error, databaseUrl).join("\n");

    expect(details).toContain("migration runner failed");
    expect(details).toContain("28P01: password authentication failed for user \"borobiya\"");
    expect(details).toContain("[redacted DATABASE_URL]");
    expect(details).not.toContain("secret-token");
    expect(details).not.toContain(databaseUrl);
  });

  it("redacts password parameters when no DATABASE_URL is supplied", () => {
    const details = safeMigrationErrorDetails(
      new Error("connection option password=private-value was rejected")
    );

    expect(details).toEqual(["connection option password=[redacted] was rejected"]);
    expect(details.join(" ")).not.toContain("private-value");
  });

  it("reports string failures without exposing connection strings", () => {
    const details = safeMigrationErrorDetails(
      "failed to connect to postgres://user:secret@db:5432/app"
    );

    expect(details).toEqual(["failed to connect to [redacted DATABASE_URL]"]);
    expect(details.join(" ")).not.toContain("secret");
  });
});
