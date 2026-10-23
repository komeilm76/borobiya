CREATE TABLE "location_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"accuracy" double precision,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_history_lat_check" CHECK ("lat" BETWEEN -90 AND 90),
	CONSTRAINT "location_history_lon_check" CHECK ("lon" BETWEEN -180 AND 180),
	CONSTRAINT "location_history_accuracy_check" CHECK ("accuracy" IS NULL OR "accuracy" >= 0)
);
--> statement-breakpoint
CREATE TABLE "location_history_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"from_time" timestamp with time zone NOT NULL,
	"to_time" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_history_shares_owner_target_window_unique" UNIQUE("owner_id","target_user_id","from_time","to_time"),
	CONSTRAINT "location_history_shares_owner_target_check" CHECK ("owner_id" <> "target_user_id"),
	CONSTRAINT "location_history_shares_window_check" CHECK ("to_time" > "from_time")
);
--> statement-breakpoint
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_history_shares" ADD CONSTRAINT "location_history_shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_history_shares" ADD CONSTRAINT "location_history_shares_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_location_history_user_time" ON "location_history" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "location_history_shares_owner_idx" ON "location_history_shares" USING btree ("owner_id","from_time");--> statement-breakpoint
CREATE INDEX "location_history_shares_target_idx" ON "location_history_shares" USING btree ("target_user_id","from_time");