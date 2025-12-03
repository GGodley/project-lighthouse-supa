-- Add status constraint, error tracking, and retry count columns to meetings table
-- This migration adds robust state management and error handling capabilities

-- Step 1: Add new columns for error tracking and retry logic
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS error_details JSONB,
ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reschedule_attempt TIMESTAMPTZ;

-- Step 1.5: Add dispatch_status column for atomic locking and workflow tracking
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'pending';

-- Step 2: Add comments for new columns
COMMENT ON COLUMN meetings.error_details IS 'Structured error information including error type, message, context, and stack trace';
COMMENT ON COLUMN meetings.last_error_at IS 'Timestamp when the last error occurred';
COMMENT ON COLUMN meetings.retry_count IS 'Number of retry attempts for bot dispatch or reschedule operations';
COMMENT ON COLUMN meetings.last_reschedule_attempt IS 'Timestamp of the last reschedule attempt (for debouncing)';
COMMENT ON COLUMN meetings.dispatch_status IS 'Dispatch workflow status: pending (ready for bot), processing (bot being dispatched), completed (bot dispatched successfully)';

-- Step 3: First, identify and handle existing rows with invalid status values
-- This query will show us what statuses exist (for debugging)
-- SELECT DISTINCT status, COUNT(*) FROM meetings GROUP BY status;

-- Step 4: Backfill/clean up existing status values before adding constraint
-- Map any unknown/invalid statuses to valid ones
-- This handles existing rows with 'processing' and 'done' statuses from process-transcript

-- First, map 'done' to 'recording_scheduled' (meeting completed, transcript saved)
UPDATE meetings 
SET status = 'recording_scheduled'
WHERE status = 'done';

-- Second, map 'processing' to 'recording_scheduled' (transcript being processed, bot already scheduled)
UPDATE meetings 
SET status = 'recording_scheduled'
WHERE status = 'processing';

-- Third, handle any other unknown statuses by setting to NULL
-- (They will be set to appropriate values on next processing)
UPDATE meetings 
SET status = NULL
WHERE status IS NOT NULL 
  AND status NOT IN (
    'new', 
    'passed_event', 
    'scheduling_in_progress', 
    'recording_scheduled', 
    'rescheduling', 
    'missing_url', 
    'error'
  );

-- Step 5: Drop existing status constraint if it exists (to replace with comprehensive one)
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_status_check;

-- Step 6: Add comprehensive status constraint with all valid states
ALTER TABLE meetings 
ADD CONSTRAINT meetings_status_check 
CHECK (
  status IN (
    'new',                      -- New meeting, ready for bot dispatch
    'passed_event',             -- Meeting time has passed
    'scheduling_in_progress',   -- Bot is being scheduled (atomic lock state)
    'recording_scheduled',      -- Bot successfully scheduled (also used for completed meetings with transcript)
    'rescheduling',             -- Meeting is being rescheduled (bot deletion in progress)
    'missing_url',              -- Meeting has no valid meeting URL
    'error'                     -- Error occurred during processing
  ) OR status IS NULL
);

-- Step 6.5: Add CHECK constraint for valid dispatch_status values
ALTER TABLE meetings 
ADD CONSTRAINT meetings_dispatch_status_check 
CHECK (dispatch_status IN ('pending', 'processing', 'completed') OR dispatch_status IS NULL);

-- Step 7: Add comment documenting status values
COMMENT ON COLUMN meetings.status IS 'Meeting status: new (ready for bot), passed_event (time passed), scheduling_in_progress (bot being scheduled), recording_scheduled (bot scheduled or meeting completed with transcript), rescheduling (reschedule in progress), missing_url (no URL), error (processing error)';

-- Step 8: Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_last_error_at ON meetings(last_error_at) WHERE last_error_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_retry_count ON meetings(retry_count) WHERE retry_count > 0;
CREATE INDEX IF NOT EXISTS idx_meetings_stuck_processing ON meetings(status, updated_at) 
  WHERE status IN ('scheduling_in_progress', 'rescheduling');
CREATE INDEX IF NOT EXISTS idx_meetings_dispatch_status 
ON meetings(dispatch_status) 
WHERE dispatch_status IS NOT NULL;

-- Step 9: Backfill retry_count for existing meetings
UPDATE meetings 
SET retry_count = 0 
WHERE retry_count IS NULL;

-- Step 9.5: Backfill dispatch_status for existing meetings
UPDATE meetings 
SET dispatch_status = 'pending' 
WHERE dispatch_status IS NULL;

-- Step 10: Set default for retry_count
ALTER TABLE meetings 
ALTER COLUMN retry_count SET DEFAULT 0;

