-- Emergency Stop: Stop all thread sync processing
-- This will mark all active jobs as failed to immediately stop processing
-- NOTE: These jobs will need to be manually restarted later if you want to resume

-- 1. Mark all running sync jobs as failed
UPDATE sync_jobs
SET status = 'failed', 
    details = COALESCE(details, '') || ' | EMERGENCY STOP: Manually stopped to reduce CPU load'
WHERE status = 'running';

-- 2. Mark all pending/processing page queue jobs as failed
UPDATE sync_page_queue
SET status = 'failed',
    error_message = 'EMERGENCY STOP: Manually stopped to reduce CPU load'
WHERE status IN ('pending', 'processing', 'retrying');

-- 3. Mark all pending/processing thread stages as failed
UPDATE thread_processing_stages
SET current_stage = 'failed',
    import_error = COALESCE(import_error, '') || ' | EMERGENCY STOP: Manually stopped to reduce CPU load',
    next_retry_at = NULL
WHERE current_stage IN ('pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing');

-- 4. Mark all pending/processing summarization jobs as failed
UPDATE thread_summarization_queue
SET status = 'failed',
    error_message = 'EMERGENCY STOP: Manually stopped to reduce CPU load'
WHERE status IN ('pending', 'processing');

-- 5. Show summary of what was paused
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

