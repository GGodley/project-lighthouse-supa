-- Emergency Stop: Stop all thread sync processing (SIMPLE VERSION)
-- Run each UPDATE separately to identify which one fails

-- Step 1: Stop sync jobs
UPDATE sync_jobs
SET status = 'failed'
WHERE status IN ('running', 'syncing', 'pending');

-- Step 2: Stop page queue
UPDATE sync_page_queue
SET status = 'failed'
WHERE status IN ('pending', 'processing', 'retrying');

-- Step 3: Stop thread stages
UPDATE thread_processing_stages
SET current_stage = 'failed'
WHERE current_stage IN ('pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing');

-- Step 4: Stop summarization queue
UPDATE thread_summarization_queue
SET status = 'failed'
WHERE status IN ('pending', 'processing');

