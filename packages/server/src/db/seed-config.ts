import { passwordSchema } from "@borobiya/shared";

export const DEFAULT_ADMIN_ID = "30000000-0000-4000-8000-000000000001";
export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin123";

export interface AdminSeedEnvironment {
  nodeEnv?: string;
  adminSeedPassword?: string;
}

/** Allows the documented local default only in explicit development/test environments. */
export function resolveAdminSeedPassword(environment: AdminSeedEnvironment): string {
  // Compose may pass an explicitly blank value when the optional variable is
  // unset; treat blank as absent instead of as a literal empty password.
  const configuredPassword =
    environment.adminSeedPassword?.trim() === "" ? undefined : environment.adminSeedPassword;
  const isLocalEnvironment = environment.nodeEnv === "development" || environment.nodeEnv === "test";
  if (!isLocalEnvironment && (!configuredPassword || configuredPassword === DEFAULT_ADMIN_PASSWORD)) {
    throw new Error("Set a unique ADMIN_SEED_PASSWORD before seeding outside development/test.");
  }

  try {
    return passwordSchema.parse(configuredPassword ?? DEFAULT_ADMIN_PASSWORD);
  } catch {
    throw new Error("ADMIN_SEED_PASSWORD must be 8–1024 characters and contain a letter and a decimal digit.");
  }
}
