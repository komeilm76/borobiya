CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_complete_security_questions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avg_rating" numeric(2, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_location" geography(Point,4326);--> statement-breakpoint
CREATE INDEX "idx_users_last_location_gist" ON "users" USING gist ("last_location");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avg_rating_range_check" CHECK ("avg_rating" IS NULL OR "avg_rating" BETWEEN 0 AND 5);