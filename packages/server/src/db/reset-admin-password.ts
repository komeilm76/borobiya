import { passwordSchema } from "@borobiya/shared";
import { config as loadDotEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../security/password";
import { createDatabase } from "./client";
import { userSessions, users } from "./schema";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "./seed-config";

const packageRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
loadDotEnv({ path: resolve(packageRoot, "../../.env"), quiet: true });

/**
 * Operator recovery tool: set a new password for the bootstrap `admin` user
 * and revoke its existing sessions. The seed only ever creates the admin, so
 * a forgotten seed password needs this explicit reset instead of a reseed.
 *
 *   bun src/db/reset-admin-password.ts '<new-password>'
 *   ADMIN_SEED_PASSWORD='<new-password>' bun src/db/reset-admin-password.ts
 *   docker compose run --rm -e ADMIN_SEED_PASSWORD api bun src/db/reset-admin-password.ts
 */
async function resetAdminPassword(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to reset the admin password.");
  }

  const suppliedPassword = process.argv[2] ?? process.env.ADMIN_SEED_PASSWORD;
  if (!suppliedPassword) {
    throw new Error(
      "Usage: bun src/db/reset-admin-password.ts '<new-password>' (or set ADMIN_SEED_PASSWORD)."
    );
  }
  const isLocalEnvironment = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  if (!isLocalEnvironment && suppliedPassword === DEFAULT_ADMIN_PASSWORD) {
    throw new Error("Refusing to reset to the documented local default outside development/test.");
  }

  let newPassword: string;
  try {
    newPassword = passwordSchema.parse(suppliedPassword);
  } catch {
    throw new Error("The new password must be 8–1024 characters and contain a letter and a decimal digit.");
  }

  const { db, client } = createDatabase(databaseUrl);
  try {
    const [admin] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.username, DEFAULT_ADMIN_USERNAME));
    if (!admin || admin.role !== "admin") {
      throw new Error(
        `No '${DEFAULT_ADMIN_USERNAME}' admin user exists yet; run the seed first (bun run db:seed).`
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await db.transaction(async (transaction) => {
      await transaction.update(users).set({ passwordHash }).where(eq(users.id, admin.id));
      await transaction
        .update(userSessions)
        .set({ refreshTokenHash: null, isOnline: false })
        .where(eq(userSessions.userId, admin.id));
    });
    console.info(
      `Admin password reset for '${DEFAULT_ADMIN_USERNAME}'; existing admin sessions were revoked.`
    );
  } finally {
    await client.end();
  }
}

resetAdminPassword().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Admin password reset failed.");
  process.exitCode = 1;
});
