CREATE TABLE "location_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"mode" varchar(10) NOT NULL,
	"expires_at" timestamp with time zone,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"priority_device_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_shares_mode_check" CHECK ("mode" IN ('timed', 'permanent')),
	CONSTRAINT "location_shares_owner_target_check" CHECK ("owner_id" <> "target_user_id"),
	CONSTRAINT "location_shares_expiry_mode_check" CHECK (("mode" = 'timed' AND "expires_at" IS NOT NULL) OR ("mode" = 'permanent' AND "expires_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "location_shares" ADD CONSTRAINT "location_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_shares" ADD CONSTRAINT "location_shares_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_shares_owner_created_at_idx" ON "location_shares" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "location_shares_target_created_at_idx" ON "location_shares" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "location_shares_expires_at_idx" ON "location_shares" USING btree ("expires_at");