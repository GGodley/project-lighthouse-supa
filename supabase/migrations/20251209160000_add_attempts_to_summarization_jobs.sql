-- Add attempts column to summarization_jobs table for retry tracking
-- This enables the process-summarization-queue function to track retry attempts

ALTER TABLE public.summarization_jobs
ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.summarization_jobs.attempts IS 'Number of processing attempts. Jobs with attempts >= 3 will not be retried automatically.';

