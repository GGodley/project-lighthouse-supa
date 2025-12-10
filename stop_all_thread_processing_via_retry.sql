-- Emergency Stop: Stop processing via next_retry_at (NON-BLOCKING)
-- This avoids updating status fields which may have triggers/locks
-- Sets retry dates far in the future to prevent processing

-- 1. Delay sync jobs by setting a far future date (if next_retry_at exists)
-- Note: sync_jobs might not have next_retry_at, so this may not apply

-- 2. Delay page queue jobs (prevents processing)
UPDATE sync_page_queue
SET next_retry_at = NOW() + INTERVAL '30 days'
WHERE status IN ('pending', 'retrying')
  AND (next_retry_at IS NULL OR next_retry_at < NOW() + INTERVAL '30 days');

-- 3. Delay thread stages (prevents processing)
UPDATE thread_processing_stages
SET next_retry_at = NOW() + INTERVAL '30 days'
WHERE current_stage IN ('pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing')
  AND (next_retry_at IS NULL OR next_retry_at < NOW() + INTERVAL '30 days');

-- This approach:
-- - Doesn't change status (avoids triggers/locks)
-- - Functions will skip these jobs because next_retry_at is in the future
-- - Can be reversed by setting next_retry_at back to NULL

