-- Emergency Stop: QUICK VERSION - Stop only the most critical
-- This stops new work from starting, existing invocations will finish naturally
-- Run each UPDATE separately to avoid timeouts

-- 1. Stop sync jobs (prevents new pages from being created)
UPDATE sync_jobs
SET status = 'failed'
WHERE status = 'running';

-- 2. Stop pending page queue (prevents new threads from being enqueued)
UPDATE sync_page_queue
SET status = 'failed'
WHERE status = 'pending';

-- 3. Stop pending thread stages (prevents new processing from starting)
-- This is the biggest batch (21 rows) - if it times out, run the individual version
UPDATE thread_processing_stages
SET current_stage = 'failed'
WHERE current_stage = 'pending';

-- 4. Stop pending summarization (prevents new summarization from starting)
UPDATE thread_summarization_queue
SET status = 'failed'
WHERE status = 'pending';

-- NOTE: Threads already in progress (importing, preprocessing, cleaning, chunking, summarizing)
-- will finish their current invocation, then stop. This is safer than killing them mid-process.
-- 
-- To stop those too, run the individual version after this completes.

