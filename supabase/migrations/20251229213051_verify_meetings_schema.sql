-- Verify meetings table schema for Meetings Widget
-- This migration ensures all required columns exist for the widget

-- Verify required columns exist (they should already exist, but this is a safety check)
DO $$
BEGIN
  -- Check if end_time column exists, if not check for end_date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'meetings' 
    AND column_name = 'end_time'
  ) THEN
    -- If end_date exists but end_time doesn't, create end_time as alias or add it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'meetings' 
      AND column_name = 'end_date'
    ) THEN
      -- Add end_time column if end_date exists
      ALTER TABLE public.meetings 
      ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
      
      -- Backfill end_time from end_date if end_time is null
      UPDATE public.meetings 
      SET end_time = end_date 
      WHERE end_time IS NULL AND end_date IS NOT NULL;
    ELSE
      -- Neither exists, create end_time
      ALTER TABLE public.meetings 
      ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
    END IF;
  END IF;
  
  -- Ensure other required columns exist
  ALTER TABLE public.meetings 
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS meeting_url TEXT,
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
END $$;

-- Verify RLS is enabled
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Add comments for clarity
COMMENT ON COLUMN public.meetings.title IS 'Meeting title/name';
COMMENT ON COLUMN public.meetings.start_time IS 'Meeting start time in UTC (TIMESTAMPTZ)';
COMMENT ON COLUMN public.meetings.end_time IS 'Meeting end time in UTC (TIMESTAMPTZ)';
COMMENT ON COLUMN public.meetings.meeting_url IS 'URL to join the meeting (Google Meet, Zoom, etc.)';

