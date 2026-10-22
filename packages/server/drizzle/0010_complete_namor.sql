CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "category_incident_types" (
	"category_id" uuid NOT NULL,
	"incident_type_id" uuid NOT NULL,
	CONSTRAINT "category_incident_types_pkey" PRIMARY KEY("category_id","incident_type_id")
);
--> statement-breakpoint
CREATE TABLE "category_users" (
	"category_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "category_users_pkey" PRIMARY KEY("category_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "incident_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "incident_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "category_incident_types" ADD CONSTRAINT "category_incident_types_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_incident_types" ADD CONSTRAINT "category_incident_types_incident_type_id_incident_types_id_fk" FOREIGN KEY ("incident_type_id") REFERENCES "public"."incident_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_users" ADD CONSTRAINT "category_users_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_users" ADD CONSTRAINT "category_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;