-- Foreground navigation is session-scoped and expires when its heartbeat stops.
CREATE TABLE "location_trips" (
  "session_id" uuid PRIMARY KEY NOT NULL REFERENCES "user_sessions"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "expires_at" timestamp with time zone NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "location_trips_user_expires_idx" ON "location_trips" ("user_id", "expires_at");
