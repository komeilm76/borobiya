CREATE TABLE "mission_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sos_request_id" uuid NOT NULL,
	"rescuer_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mission_proposals_request_rescuer_unique" UNIQUE("sos_request_id","rescuer_id"),
	CONSTRAINT "mission_proposals_status_check" CHECK ("status" IN ('pending', 'accepted', 'declined', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_on_mission" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mission_proposals" ADD CONSTRAINT "mission_proposals_sos_request_id_sos_requests_id_fk" FOREIGN KEY ("sos_request_id") REFERENCES "public"."sos_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_proposals" ADD CONSTRAINT "mission_proposals_rescuer_id_users_id_fk" FOREIGN KEY ("rescuer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mission_proposals_rescuer_status_idx" ON "mission_proposals" USING btree ("rescuer_id","status");