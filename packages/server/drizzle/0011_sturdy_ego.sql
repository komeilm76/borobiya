-- The catalog timestamps became NOT NULL in the same release that introduced the tables, because the
-- shared response schemas require `createdAt`. Any row created between those two migrations is given the
-- migration time rather than left to block the constraint.
UPDATE "categories" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
UPDATE "incident_types" SET "created_at" = now() WHERE "created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_types" ALTER COLUMN "created_at" SET NOT NULL;