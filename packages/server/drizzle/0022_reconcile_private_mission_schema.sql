-- Forward-only reconciliation for a database whose last Drizzle migration timestamp
-- predates this entry but outranks 0020/0021 from this branch. Drizzle otherwise skips
-- those two files. Never edit/delete existing journal rows or persisted mission data.
-- Accept only ALL missing (recreate) or ALL present (fresh installs already ran 0020/21).
-- A partially present schema must be inspected and restored by an operator.
DO $mission_repair$
DECLARE present_policy_columns integer;
BEGIN
  IF to_regclass('public.missions') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'private mission schema repair requires existing missions and users';
  END IF;
  SELECT count(*) INTO present_policy_columns FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'missions'
      AND column_name IN ('rescuer_visible_to_requester', 'requester_visible_to_rescuer',
        'admin_visible_to_requester', 'admin_visible_to_rescuer');
  IF present_policy_columns = 4 AND to_regclass('public.mission_track_points') IS NOT NULL
      AND to_regclass('public.mission_suggested_routes') IS NOT NULL THEN
    RETURN;
  END IF;
  IF present_policy_columns <> 0 OR to_regclass('public.mission_track_points') IS NOT NULL
      OR to_regclass('public.mission_suggested_routes') IS NOT NULL THEN
    RAISE EXCEPTION 'partial private mission schema: stop and reconcile with an operator';
  END IF;

  ALTER TABLE public."missions" ADD COLUMN "rescuer_visible_to_requester" boolean DEFAULT true NOT NULL;
  ALTER TABLE public."missions" ADD COLUMN "requester_visible_to_rescuer" boolean DEFAULT true NOT NULL;
  ALTER TABLE public."missions" ADD COLUMN "admin_visible_to_requester" boolean DEFAULT false NOT NULL;
  ALTER TABLE public."missions" ADD COLUMN "admin_visible_to_rescuer" boolean DEFAULT false NOT NULL;
  CREATE TABLE public."mission_track_points" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "mission_id" uuid NOT NULL REFERENCES public."missions"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES public."users"("id"),
    "role" text NOT NULL,
    "lat" double precision NOT NULL,
    "lon" double precision NOT NULL,
    "accuracy" double precision,
    "observed_at" timestamp with time zone NOT NULL,
    "received_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "mission_track_points_role_check" CHECK ("role" IN ('requester', 'rescuer', 'admin')),
    CONSTRAINT "mission_track_points_lat_check" CHECK ("lat" BETWEEN -90 AND 90),
    CONSTRAINT "mission_track_points_lon_check" CHECK ("lon" BETWEEN -180 AND 180),
    CONSTRAINT "mission_track_points_accuracy_check" CHECK ("accuracy" IS NULL OR "accuracy" >= 0)
  );
  CREATE INDEX "mission_track_points_mission_observed_idx" ON public."mission_track_points" USING btree ("mission_id", "observed_at", "id");
  CREATE TABLE public."mission_suggested_routes" (
    "mission_id" uuid PRIMARY KEY NOT NULL REFERENCES public."missions"("id") ON DELETE cascade,
    "profile" text NOT NULL,
    "polyline" text NOT NULL,
    "distance_m" double precision NOT NULL,
    "selected_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "mission_suggested_routes_profile_check" CHECK ("profile" IN ('car', 'bicycle', 'foot')),
    CONSTRAINT "mission_suggested_routes_distance_check" CHECK ("distance_m" >= 0)
  );
END
$mission_repair$;
