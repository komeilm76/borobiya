CREATE TABLE "sos_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"incident_type_id" uuid NOT NULL,
	"location" "geography(Point,4326)" NOT NULL,
	"accuracy" double precision,
	"is_manual" boolean DEFAULT false NOT NULL,
	"photo_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"cancellation_reason_id" uuid,
	"cancellation_custom_text" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sos_requests_severity_check" CHECK ("severity" IN ('low', 'medium', 'high')),
	CONSTRAINT "sos_requests_description_length_check" CHECK (char_length("description") BETWEEN 10 AND 500),
	CONSTRAINT "sos_requests_status_check" CHECK ("status" IN ('pending', 'dispatched', 'accepted', 'cancelled_by_requester', 'cancelled_by_rescuer', 'expired', 'completed'))
);
--> statement-breakpoint
ALTER TABLE "sos_requests" ADD CONSTRAINT "sos_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_requests" ADD CONSTRAINT "sos_requests_incident_type_id_incident_types_id_fk" FOREIGN KEY ("incident_type_id") REFERENCES "public"."incident_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_requests" ADD CONSTRAINT "sos_requests_cancellation_reason_id_cancellation_reasons_id_fk" FOREIGN KEY ("cancellation_reason_id") REFERENCES "public"."cancellation_reasons"("id") ON DELETE no action ON UPDATE no action;