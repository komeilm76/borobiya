CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "idx_users_username_trgm" ON "users" USING gin ("username" gin_trgm_ops);