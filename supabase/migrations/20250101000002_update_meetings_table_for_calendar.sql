-- Add missing columns to meetings table for calendar sync functionality
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS google_event_id TEXT,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS attendees JSONB,
ADD COLUMN IF NOT EXISTS external_attendees JSONB;

-- Create unique constraint for google_event_id and user_id combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_google_event_user 
ON meetings(google_event_id, user_id) 
WHERE google_event_id IS NOT NULL;

-- Add comments for new columns
COMMENT ON COLUMN meetings.google_event_id IS 'Google Calendar event ID for syncing';
COMMENT ON COLUMN meetings.title IS 'Meeting title from Google Calendar';
COMMENT ON COLUMN meetings.end_date IS 'Meeting end date/time';
COMMENT ON COLUMN meetings.location IS 'Meeting location';
COMMENT ON COLUMN meetings.description IS 'Meeting description';
COMMENT ON COLUMN meetings.attendees IS 'Array of all attendee emails';
COMMENT ON COLUMN meetings.external_attendees IS 'Array of external attendee emails';
