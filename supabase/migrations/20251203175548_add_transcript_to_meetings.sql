-- Add transcript column to meetings table
-- This stores the full text transcript of the meeting, which is saved
-- from the transcription_jobs table after the transcript is verified

ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS transcript TEXT;

-- Add comment for clarity
COMMENT ON COLUMN meetings.transcript IS 'Full text transcript of the meeting, saved from Recall.ai after verification.';

