import { describe, expect, it } from "vitest";
import {
  apiRoutes,
  incidentSlugSchema,
  loginSchema,
  missionProgressStatusSchema,
  severitySchema
} from "./index";

describe("shared package barrel", () => {
  it("exports domain schemas and enums from the public entry point", () => {
    expect(loginSchema.safeParse({ username: "rescue_user", password: "pass" }).success).toBe(true);
    expect(severitySchema.enum.high).toBe("high");
    expect(missionProgressStatusSchema.safeParse("on_the_way").success).toBe(true);
    expect(incidentSlugSchema.safeParse("fire").success).toBe(true);
    expect(apiRoutes.auth.login.url).toBe("/_auth/login");
  });
});
