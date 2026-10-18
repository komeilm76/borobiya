import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../security/password";
import { createDatabase } from "./client";
import { cancellationReasons, securityQuestions, users } from "./schema";
import { cancellationReasonSeeds, securityQuestionSeeds } from "./seed-data";
import {
  DEFAULT_ADMIN_ID,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  resolveAdminSeedPassword
} from "./seed-config";

const packageRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
loadDotEnv({ path: resolve(packageRoot, "../../.env") });

async function seedDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const adminPassword = resolveAdminSeedPassword({
    nodeEnv: process.env.NODE_ENV,
    adminSeedPassword: process.env.ADMIN_SEED_PASSWORD
  });
  const passwordHash = await hashPassword(adminPassword);

  const { db, client } = createDatabase(databaseUrl);
  let seededDefaultAdmin = false;
  try {
    await db.transaction(async (transaction) => {
      await transaction.insert(securityQuestions).values([...securityQuestionSeeds]).onConflictDoNothing();
      await transaction
        .insert(cancellationReasons)
        .values([...cancellationReasonSeeds])
        .onConflictDoNothing();
      const insertedAdmin = await transaction
        .insert(users)
        .values({
          id: DEFAULT_ADMIN_ID,
          username: DEFAULT_ADMIN_USERNAME,
          passwordHash,
          role: "admin"
        })
        .onConflictDoNothing({ target: users.username })
        .returning({ id: users.id });
      seededDefaultAdmin = insertedAdmin.length > 0 && adminPassword === DEFAULT_ADMIN_PASSWORD;
    });

    if (seededDefaultAdmin) {
      console.warn("Using the local bootstrap admin password; change it before exposing this deployment.");
    }
    console.info("Seeded reference data and ensured the bootstrap admin account exists.");
  } finally {
    await client.end();
  }
}

seedDatabase().catch(() => {
  console.error("Database seeding failed. Check migrations, DATABASE_URL, and the bootstrap password policy; no credentials were logged.");
  process.exitCode = 1;
});
