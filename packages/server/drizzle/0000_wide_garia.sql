CREATE TABLE "security_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_questions_text_unique" UNIQUE("text")
);
--> statement-breakpoint
CREATE TABLE "user_security_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_security_answers_user_question_unique" UNIQUE("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text,
	"refresh_token_hash" text,
	"ip" text,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(30) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(10) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_username_format_check" CHECK (char_length("username") BETWEEN 3 AND 30 AND "username" ~ '^[a-z0-9_]+$'),
	CONSTRAINT "users_role_check" CHECK ("role" IN ('user', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "user_security_answers" ADD CONSTRAINT "user_security_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_security_answers" ADD CONSTRAINT "user_security_answers_question_id_security_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."security_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");