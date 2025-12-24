-- Add missing fields to sync_jobs table for run record tracking
-- Fields: next_page_token, processed_count, error

-- Add next_page_token for pagination state
ALTER TABLE public.sync_jobs
ADD COLUMN IF NOT EXISTS next_page_token TEXT;

-- Add processed_count to track number of items processed
ALTER TABLE public.sync_jobs
ADD COLUMN IF NOT EXISTS processed_count INTEGER DEFAULT 0;

-- Add error column for error details (separate from details for structured error handling)
ALTER TABLE public.sync_jobs
ADD COLUMN IF NOT EXISTS error TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.sync_jobs.next_page_token IS 'Gmail API nextPageToken for pagination state';
COMMENT ON COLUMN public.sync_jobs.processed_count IS 'Number of threads/items processed in this sync run';
COMMENT ON COLUMN public.sync_jobs.error IS 'Error message if sync failed (structured error details)';

-- Create index on processed_count for analytics
CREATE INDEX IF NOT EXISTS idx_sync_jobs_processed_count ON public.sync_jobs(processed_count);

