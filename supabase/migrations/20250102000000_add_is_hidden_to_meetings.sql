-- Add is_hidden column to meetings table for hiding meetings from UI
-- Default value is false (meetings are visible by default)

-- Add is_hidden column
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false NOT NULL;

-- Add comment documenting the column
COMMENT ON COLUMN meetings.is_hidden IS 'When true, the meeting is hidden from the UI. Can be toggled via manage-meeting edge function.';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_meetings_is_hidden 
ON meetings(is_hidden) 
WHERE is_hidden = true;

-- Backfill existing meetings to have is_hidden = false
UPDATE meetings 
SET is_hidden = false 
WHERE is_hidden IS NULL;

