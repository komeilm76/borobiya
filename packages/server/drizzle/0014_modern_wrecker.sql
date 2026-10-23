CREATE TABLE "mission_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mission_status_history_from_check" CHECK ("from_status" IS NULL OR "from_status" IN ('pending', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled_by_requester', 'cancelled_by_rescuer', 'expired')),
	CONSTRAINT "mission_status_history_to_check" CHECK ("to_status" IN ('pending', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled_by_requester', 'cancelled_by_rescuer', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sos_request_id" uuid NOT NULL,
	"rescuer_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"cancelled_by" text,
	"cancellation_reason_id" uuid,
	"cancellation_custom_text" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missions_status_check" CHECK ("status" IN ('pending', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled_by_requester', 'cancelled_by_rescuer', 'expired')),
	CONSTRAINT "missions_cancelled_by_check" CHECK ("cancelled_by" IS NULL OR "cancelled_by" IN ('requester', 'rescuer', 'admin', 'system')),
	CONSTRAINT "missions_distinct_participants_check" CHECK ("rescuer_id" <> "requester_id")
);
--> statement-breakpoint
ALTER TABLE "mission_status_history" ADD CONSTRAINT "mission_status_history_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_status_history" ADD CONSTRAINT "mission_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_sos_request_id_sos_requests_id_fk" FOREIGN KEY ("sos_request_id") REFERENCES "public"."sos_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_rescuer_id_users_id_fk" FOREIGN KEY ("rescuer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_cancellation_reason_id_cancellation_reasons_id_fk" FOREIGN KEY ("cancellation_reason_id") REFERENCES "public"."cancellation_reasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mission_status_history_mission_created_idx" ON "mission_status_history" USING btree ("mission_id","created_at");--> statement-breakpoint
CREATE INDEX "missions_sos_request_id_idx" ON "missions" USING btree ("sos_request_id");--> statement-breakpoint
CREATE INDEX "missions_rescuer_status_idx" ON "missions" USING btree ("rescuer_id","status");--> statement-breakpoint
CREATE INDEX "missions_requester_id_idx" ON "missions" USING btree ("requester_id");