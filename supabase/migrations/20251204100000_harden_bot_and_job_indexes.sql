-- Harden lookup performance for Recall bot + transcription job flows
-- NOTE: These indexes are NON-UNIQUE to avoid failing if legacy duplicates exist.
--       They are designed to:
--         - Speed up lookups by recall_bot_id on meetings
--         - Speed up lookups by (meeting_id, recall_bot_id) on transcription_jobs
--       Once data has been cleaned up, you can optionally replace them with UNIQUE
--       indexes if you want to enforce strict 1:1 invariants at the schema level.

-- 1. Index to support fast meeting lookup by recall_bot_id
CREATE INDEX IF NOT EXISTS idx_meetings_recall_bot_id
ON public.meetings(recall_bot_id)
WHERE recall_bot_id IS NOT NULL;

-- 2. Composite index to support fast job lookup by (meeting_id, recall_bot_id)
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_meeting_recall_bot
ON public.transcription_jobs(meeting_id, recall_bot_id)
WHERE recall_bot_id IS NOT NULL;


