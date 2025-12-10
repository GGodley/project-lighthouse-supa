-- Emergency Stop: Stop all thread sync processing (SAFE VERSION)
-- This version sets next_retry_at far in the future instead of marking as failed
-- Jobs can be resumed by setting next_retry_at back to NULL or a near date

-- 1. Mark all running sync jobs as failed (with note that it's temporary)
UPDATE sync_jobs
SET status = 'failed', 
    details = COALESCE(details, '') || ' | TEMPORARY STOP: Manually paused to reduce CPU load (can be resumed)'
WHERE status = 'running';

-- 2. Set next_retry_at far in the future for page queue jobs (prevents processing)
UPDATE sync_page_queue
SET next_retry_at = NOW() + INTERVAL '30 days',
    error_message = 'TEMPORARY STOP: Manually paused to reduce CPU load (set next_retry_at to NULL to resume)'
WHERE status IN ('pending', 'processing', 'retrying');

-- 3. Set next_retry_at far in the future for thread stages (prevents processing)
UPDATE thread_processing_stages
SET next_retry_at = NOW() + INTERVAL '30 days',
    import_error = COALESCE(import_error, '') || ' | TEMPORARY STOP: Manually paused (set next_retry_at to NULL to resume)'
WHERE current_stage IN ('pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing');

-- 4. Set next_retry_at far in the future for summarization jobs (prevents processing)
UPDATE thread_summarization_queue
SET status = 'failed',
    error_message = 'TEMPORARY STOP: Manually paused to reduce CPU load (set status to pending to resume)'
WHERE status IN ('pending', 'processing');

-- 5. Show summary of what was stopped
SELECT 
    'sync_jobs' as table_name,
    status,
    COUNT(*) as count
FROM sync_jobs
GROUP BY status
UNION ALL
SELECT 
    'sync_page_queue' as table_name,
    status,
    COUNT(*) as count
FROM sync_page_queue
GROUP BY status
UNION ALL
SELECT 
    'thread_processing_stages' as table_name,
    current_stage as status,
    COUNT(*) as count
FROM thread_processing_stages
GROUP BY current_stage
UNION ALL
SELECT 
    'thread_summarization_queue' as table_name,
    status,
    COUNT(*) as count
FROM thread_summarization_queue
GROUP BY status
ORDER BY table_name, status;

