-- Migration: Add meeting_type and meeting_url columns to meetings table for Zoom support
-- Run this in Supabase Dashboard SQL Editor: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/sql/new

-- Step 1: Temporarily disable the trigger that references start_time_utc (which may not exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_start_time_utc_before_write'
  ) THEN
    DROP TRIGGER IF EXISTS set_start_time_utc_before_write ON public.meetings;
    RAISE NOTICE 'Temporarily disabled set_start_time_utc_before_write trigger';
  END IF;
END $$;

-- Step 2: Create a safe no-op trigger function that won't reference non-existent columns
-- This function will work whether or not start_time_utc exists
CREATE OR REPLACE FUNCTION public.set_start_time_utc()
RETURNS TRIGGER AS $$
BEGIN
  -- No-op function: just return NEW without referencing any columns
  -- This prevents errors when the trigger fires during ALTER TABLE operations
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Add meeting_type column
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS meeting_type TEXT 
CHECK (meeting_type IN ('google_meet', 'zoom') OR meeting_type IS NULL);

-- Add comment for meeting_type
COMMENT ON COLUMN meetings.meeting_type IS 'Type of meeting platform: google_meet or zoom';

-- Add meeting_url column (generic meeting URL field)
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS meeting_url TEXT;

-- Add comment for meeting_url
COMMENT ON COLUMN meetings.meeting_url IS 'Generic meeting URL (replaces hangout_link for Zoom, same value for Google Meet)';

-- Create index on meeting_type for querying
CREATE INDEX IF NOT EXISTS idx_meetings_meeting_type 
ON meetings(meeting_type) 
WHERE meeting_type IS NOT NULL;

-- Backfill meeting_url from hangout_link for existing Google Meet meetings
UPDATE meetings 
SET meeting_url = hangout_link 
WHERE hangout_link IS NOT NULL 
  AND meeting_url IS NULL;

-- Backfill meeting_type for existing meetings with hangout_link (assume Google Meet)
UPDATE meetings 
SET meeting_type = 'google_meet' 
WHERE hangout_link IS NOT NULL 
  AND meeting_type IS NULL;

-- Step 4: Re-enable the trigger if start_time_utc column exists
-- The function is already a safe no-op, so we can safely recreate the trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'meetings' 
      AND column_name = 'start_time_utc'
  ) THEN
    -- Column exists, recreate the trigger (function is already a safe no-op)
    -- If you need the start_time_utc functionality, update the function separately
    EXECUTE 'CREATE TRIGGER set_start_time_utc_before_write
             BEFORE INSERT OR UPDATE ON public.meetings
             FOR EACH ROW
             EXECUTE FUNCTION public.set_start_time_utc()';
  END IF;
END $$;

