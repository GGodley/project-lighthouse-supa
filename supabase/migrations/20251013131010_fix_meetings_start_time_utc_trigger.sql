-- Fix meetings start_time_utc trigger to avoid referencing removed `timezone` column
-- Assumes `meetings.start_time` is TIMESTAMPTZ (UTC or with zone). If it's TIMESTAMP WITHOUT TIME ZONE,
-- you should adjust this function to apply the desired timezone before casting to UTC.

DO $$
BEGIN
  -- Drop existing trigger if it exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_start_time_utc_before_write'
  ) THEN
    DROP TRIGGER set_start_time_utc_before_write ON public.meetings;
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- meetings table may not exist in some environments; ignore
  NULL;
END $$;

-- Replace the trigger function
CREATE OR REPLACE FUNCTION public.set_start_time_utc()
RETURNS TRIGGER AS $$
BEGIN
  -- If start_time_utc is provided explicitly, keep it; otherwise derive from start_time
  IF NEW.start_time_utc IS NULL THEN
    -- If start_time is timestamptz, it's already timezone-aware; assign directly
    NEW.start_time_utc := NEW.start_time;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger (before insert/update)
CREATE TRIGGER set_start_time_utc_before_write
BEFORE INSERT OR UPDATE ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.set_start_time_utc();


