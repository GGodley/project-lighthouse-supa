-- Add bot_enabled column to meetings table for per-meeting bot dispatch toggle
-- Default value is true (bot dispatch enabled by default)

-- Add bot_enabled column
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN DEFAULT true NOT NULL;

-- Add comment documenting the column
COMMENT ON COLUMN meetings.bot_enabled IS 'User-controlled toggle: when false, bot dispatch is disabled for this meeting. Can be toggled via UI. Default is true (enabled).';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_meetings_bot_enabled 
ON meetings(bot_enabled) 
WHERE bot_enabled = false;

-- Backfill existing meetings to have bot_enabled = true
UPDATE meetings 
SET bot_enabled = true 
WHERE bot_enabled IS NULL;

-- Verify start_time and end_time are TIMESTAMPTZ for UTC support
-- Note: This migration assumes start_time and end_time are already TIMESTAMPTZ
-- If they are not, a separate migration would be needed to convert them
COMMENT ON COLUMN meetings.start_time IS 'Meeting start time in UTC (TIMESTAMPTZ). All times sent to Recall.ai must be in UTC ISO format.';
COMMENT ON COLUMN meetings.end_time IS 'Meeting end time in UTC (TIMESTAMPTZ). All times sent to Recall.ai must be in UTC ISO format.';

