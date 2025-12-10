-- Emergency Stop: Stop all thread sync processing (MINIMAL VERSION)
-- Minimal updates to avoid any constraint or concatenation issues

-- 1. Stop running/pending sync jobs
UPDATE sync_jobs
SET status = 'failed'
WHERE status IN ('running', 'pending');

-- 2. Stop pending/retrying page queue jobs
UPDATE sync_page_queue
SET status = 'failed'
WHERE status IN ('pending', 'retrying');

-- 3. Stop all active thread stages
UPDATE thread_processing_stages
SET current_stage = 'failed'
WHERE current_stage IN ('pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing');

-- 4. Stop pending summarization jobs
UPDATE thread_summarization_queue
SET status = 'failed'
WHERE status = 'pending';

