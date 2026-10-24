CREATE TABLE "mission_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"rater_id" uuid NOT NULL,
	"ratee_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mission_ratings_mission_rater_unique" UNIQUE("mission_id","rater_id"),
	CONSTRAINT "mission_ratings_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
	CONSTRAINT "mission_ratings_comment_length_check" CHECK ("comment" IS NULL OR char_length("comment") <= 500)
);
--> statement-breakpoint
ALTER TABLE "mission_ratings" ADD CONSTRAINT "mission_ratings_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_ratings" ADD CONSTRAINT "mission_ratings_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_ratings" ADD CONSTRAINT "mission_ratings_ratee_id_users_id_fk" FOREIGN KEY ("ratee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mission_ratings_ratee_id_idx" ON "mission_ratings" USING btree ("ratee_id");--> statement-breakpoint
-- Serialize writes to a responder's ratings before the aggregate is recomputed.
-- The lock is acquired BEFORE inserting/updating/deleting a row so a concurrent
-- rating cannot overwrite the cache from a snapshot that missed another writer.
CREATE FUNCTION mission_ratings_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  mission_requester uuid;
  mission_rescuer uuid;
  mission_state text;
  target_user uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_user := OLD.ratee_id;
  ELSE
    IF TG_OP = 'UPDATE' AND (NEW.mission_id IS DISTINCT FROM OLD.mission_id
        OR NEW.rater_id IS DISTINCT FROM OLD.rater_id OR NEW.ratee_id IS DISTINCT FROM OLD.ratee_id) THEN
      RAISE EXCEPTION 'Rating participants and mission cannot change' USING ERRCODE = '23514';
    END IF;
    SELECT requester_id, rescuer_id, status
      INTO mission_requester, mission_rescuer, mission_state
      FROM missions WHERE id = NEW.mission_id;
    IF mission_state IS DISTINCT FROM 'completed'
      OR NEW.rater_id IS DISTINCT FROM mission_requester
      OR NEW.ratee_id IS DISTINCT FROM mission_rescuer THEN
      RAISE EXCEPTION 'Only the requester can rate the assigned rescuer after completion'
        USING ERRCODE = '23514';
    END IF;
    target_user := NEW.ratee_id;
  END IF;

  PERFORM 1 FROM users WHERE id = target_user FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER mission_ratings_guard_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON mission_ratings
  FOR EACH ROW EXECUTE FUNCTION mission_ratings_guard();
--> statement-breakpoint
CREATE FUNCTION mission_ratings_refresh_average() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_user uuid;
BEGIN
  target_user := CASE WHEN TG_OP = 'DELETE' THEN OLD.ratee_id ELSE NEW.ratee_id END;
  UPDATE users SET avg_rating = (
    SELECT round(avg(rating)::numeric, 1) FROM mission_ratings WHERE ratee_id = target_user
  ) WHERE id = target_user;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER mission_ratings_refresh_after_write
  AFTER INSERT OR UPDATE OR DELETE ON mission_ratings
  FOR EACH ROW EXECUTE FUNCTION mission_ratings_refresh_average();
