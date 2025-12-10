-- Emergency Stop: Stop all thread sync processing (BATCHED VERSION)
-- Updates in smaller batches to avoid timeouts
-- Run each batch separately if needed

-- Batch 1: Stop sync jobs (small batch - only 10 jobs)
UPDATE sync_jobs
SET status = 'failed'
WHERE status IN ('running', 'pending')
LIMIT 10;

-- Batch 2: Stop page queue jobs (small batch - only 3 jobs)
UPDATE sync_page_queue
SET status = 'failed'
WHERE status IN ('pending', 'retrying')
LIMIT 10;

-- Batch 3: Stop thread stages in batches of 20
-- Run this multiple times until no more rows are updated
UPDATE thread_processing_stages
SET current_stage = 'failed'
WHERE current_stage IN ('pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing')
  AND current_stage != 'failed'  -- Avoid re-updating already failed ones
LIMIT 20;

-- Batch 4: Stop summarization jobs in batches of 20
UPDATE thread_summarization_queue
SET status = 'failed'
WHERE status = 'pending'
LIMIT 20;

