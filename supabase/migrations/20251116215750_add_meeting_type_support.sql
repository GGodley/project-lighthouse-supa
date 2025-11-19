-- Add meeting_type and meeting_url columns to meetings table for Zoom support

-- Add meeting_type column
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

