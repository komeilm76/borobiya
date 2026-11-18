ALTER TABLE "missions" ADD COLUMN "rescuer_visible_to_requester" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "requester_visible_to_rescuer" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "admin_visible_to_requester" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "admin_visible_to_rescuer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "mission_track_points" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "mission_id" uuid NOT NULL REFERENCES "missions"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" text NOT NULL,
  "lat" double precision NOT NULL,
  "lon" double precision NOT NULL,
  "accuracy" double precision,
  "observed_at" timestamp with time zone NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mission_track_points_role_check" CHECK ("role" IN ('requester', 'rescuer', 'admin')),
  CONSTRAINT "mission_track_points_lat_check" CHECK ("lat" BETWEEN -90 AND 90),
  CONSTRAINT "mission_track_points_lon_check" CHECK ("lon" BETWEEN -180 AND 180),
  CONSTRAINT "mission_track_points_accuracy_check" CHECK ("accuracy" IS NULL OR "accuracy" >= 0)
);--> statement-breakpoint
CREATE INDEX "mission_track_points_mission_observed_idx" ON "mission_track_points" USING btree ("mission_id", "observed_at", "id");