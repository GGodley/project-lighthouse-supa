-- Add status constraint, error tracking, and retry count columns to meetings table
-- This migration adds robust state management and error handling capabilities

-- Step 1: Add new columns for error tracking and retry logic
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS error_details JSONB,
ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reschedule_attempt TIMESTAMPTZ;

-- Step 2: Add comments for new columns
COMMENT ON COLUMN meetings.error_details IS 'Structured error information including error type, message, context, and stack trace';
COMMENT ON COLUMN meetings.last_error_at IS 'Timestamp when the last error occurred';
COMMENT ON COLUMN meetings.retry_count IS 'Number of retry attempts for bot dispatch or reschedule operations';
COMMENT ON COLUMN meetings.last_reschedule_attempt IS 'Timestamp of the last reschedule attempt (for debouncing)';

-- Step 3: Drop existing status constraint if it exists (to replace with comprehensive one)
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_status_check;

-- Step 4: Add comprehensive status constraint with all valid states
ALTER TABLE meetings 
ADD CONSTRAINT meetings_status_check 
CHECK (
  status IN (
    'new',                      -- New meeting, ready for bot dispatch
    'passed_event',             -- Meeting time has passed
    'scheduling_in_progress',   -- Bot is being scheduled (atomic lock state)
    'recording_scheduled',      -- Bot successfully scheduled
    'rescheduling',             -- Meeting is being rescheduled (bot deletion in progress)
    'missing_url',              -- Meeting has no valid meeting URL
    'error'                     -- Error occurred during processing
  ) OR status IS NULL
);

-- Step 5: Add comment documenting status values
COMMENT ON COLUMN meetings.status IS 'Meeting status: new (ready for bot), passed_event (time passed), scheduling_in_progress (bot being scheduled), recording_scheduled (bot scheduled), rescheduling (reschedule in progress), missing_url (no URL), error (processing error)';

-- Step 6: Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_last_error_at ON meetings(last_error_at) WHERE last_error_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_retry_count ON meetings(retry_count) WHERE retry_count > 0;
CREATE INDEX IF NOT EXISTS idx_meetings_stuck_processing ON meetings(status, updated_at) 
  WHERE status IN ('scheduling_in_progress', 'rescheduling');

-- Step 7: Backfill retry_count for existing meetings
UPDATE meetings 
SET retry_count = 0 
WHERE retry_count IS NULL;

-- Step 8: Set default for retry_count
ALTER TABLE meetings 
ALTER COLUMN retry_count SET DEFAULT 0;

