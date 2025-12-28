-- Update meeting_type CHECK constraint to include microsoft_teams

-- Drop existing constraint if it exists
ALTER TABLE meetings 
DROP CONSTRAINT IF EXISTS meetings_meeting_type_check;

-- Add new constraint with microsoft_teams support
ALTER TABLE meetings 
ADD CONSTRAINT meetings_meeting_type_check 
CHECK (meeting_type IN ('google_meet', 'zoom', 'microsoft_teams') OR meeting_type IS NULL);

-- Update comment
COMMENT ON COLUMN meetings.meeting_type IS 'Type of meeting platform: google_meet, zoom, or microsoft_teams';

