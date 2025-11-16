-- Add progress tracking columns to sync_jobs table
ALTER TABLE public.sync_jobs
ADD COLUMN IF NOT EXISTS total_pages INTEGER,
ADD COLUMN IF NOT EXISTS pages_completed INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.sync_jobs.total_pages IS 'Total number of pages to process (estimated or actual). NULL until first page is processed.';
COMMENT ON COLUMN public.sync_jobs.pages_completed IS 'Number of pages completed so far. Starts at 0 and increments as pages are processed.';

