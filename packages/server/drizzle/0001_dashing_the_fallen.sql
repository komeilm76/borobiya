CREATE TABLE "cancellation_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"label_fa" text,
	"requires_custom_text" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cancellation_reasons_type_key_unique" UNIQUE("type","key"),
	CONSTRAINT "cancellation_reasons_type_check" CHECK ("type" IN ('requester', 'rescuer')),
	CONSTRAINT "cancellation_reasons_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]*$')
);
