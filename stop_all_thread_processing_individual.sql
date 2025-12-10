-- Emergency Stop: Stop all thread sync processing (INDIVIDUAL UPDATES)
-- Run each UPDATE statement separately to avoid timeouts
-- This is the safest approach for large datasets

-- ============================================
-- STEP 1: Stop sync jobs (10 jobs)
-- ============================================
UPDATE sync_jobs
SET status = 'failed'
WHERE status = 'running';

UPDATE sync_jobs
SET status = 'failed'
WHERE status = 'pending';

-- ============================================
-- STEP 2: Stop page queue (3 jobs)
-- ============================================
UPDATE sync_page_queue
SET status = 'failed'
WHERE status = 'pending';

UPDATE sync_page_queue
SET status = 'failed'
WHERE status = 'retrying';

-- ============================================
-- STEP 3: Stop thread stages by stage (77 jobs total)
-- Run each one separately
-- ============================================
-- Stop pending threads (21 jobs)
UPDATE thread_processing_stages
SET current_stage = 'failed'
WHERE current_stage = 'pending';

-- Stop importing threads (6 jobs)
UPDATE thread_processing_stages
SET current_stage = 'failed'
WHERE current_stage = 'importing';

-- Stop preprocessing threads (6 jobs)
UPDATE thread_processing_stages
SET current_stage = 'failed'
WHERE current_stage = 'preprocessing';

-- Stop cleaning threads (7 jobs)
UPDATE thread_processing_stages
SET current_stage = 'failed'
WHERE current_stage = 'cleaning';

-- Stop chunking threads (14 jobs)
UPDATE thread_processing_stages
SET current_stage = 'failed'
WHERE current_stage = 'chunking';

-- Stop summarizing threads (23 jobs)
UPDATE thread_processing_stages
SET current_stage = 'failed'
WHERE current_stage = 'summarizing';

-- ============================================
-- STEP 4: Stop summarization queue (24 jobs)
-- ============================================
UPDATE thread_summarization_queue
SET status = 'failed'
WHERE status = 'pending';

