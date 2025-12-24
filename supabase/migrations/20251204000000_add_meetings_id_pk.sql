-- Add a robust primary key to meetings while preserving existing behavior
-- This migration is designed to be safe even if parts of the schema already exist.

-- 1. Add id column if it doesn't exist
ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS id BIGINT GENERATED ALWAYS AS IDENTITY;

-- 2. Make id the primary key
-- Drop any existing primary key constraint so we can replace it with id
ALTER TABLE public.meetings
DROP CONSTRAINT IF EXISTS meetings_pkey;

ALTER TABLE public.meetings
ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);

-- 3. Ensure the unique business key on (google_event_id, user_id) remains in place
-- This may already exist from 20250921182259_update_meetings_table_for_calendar.sql;
-- we recreate it defensively using IF NOT EXISTS.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_google_event_user 
ON public.meetings(google_event_id, user_id) 
WHERE google_event_id IS NOT NULL;

-- Notes:
-- - Existing code that looks up meetings by (google_event_id, user_id) continues to work.
-- - Edge functions that select meetings.id (process-events, dispatch-recall-bot, etc.)
--   will now succeed instead of raising 'column meetings.id does not exist'.
-- - No existing foreign keys are altered; any current references to google_event_id
--   (e.g. transcription_jobs.meeting_id -> meetings.google_event_id) remain unchanged.




