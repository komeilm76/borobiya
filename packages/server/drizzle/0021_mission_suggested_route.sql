CREATE TABLE "mission_suggested_routes" (
  "mission_id" uuid PRIMARY KEY NOT NULL REFERENCES "missions"("id") ON DELETE cascade,
  "profile" text NOT NULL,
  "polyline" text NOT NULL,
  "distance_m" double precision NOT NULL,
  "selected_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mission_suggested_routes_profile_check" CHECK ("profile" IN ('car', 'bicycle', 'foot')),
  CONSTRAINT "mission_suggested_routes_distance_check" CHECK ("distance_m" >= 0)
);