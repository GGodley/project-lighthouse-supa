-- Add unique constraint to prevent duplicate thread processing stages
-- This ensures that the same thread_id cannot be processed twice for the same sync_job_id
-- The page worker uses upsert with onConflict: 'thread_id,sync_job_id' which requires this constraint

-- First, clean up any existing duplicates (keep the most recent one per thread_id + sync_job_id)
WITH ranked AS (
  SELECT 
    id,
    thread_id,
    sync_job_id,
    ROW_NUMBER() OVER (
      PARTITION BY thread_id, sync_job_id 
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM thread_processing_stages
)
DELETE FROM thread_processing_stages
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- Add unique constraint
ALTER TABLE thread_processing_stages
ADD CONSTRAINT uniq_thread_per_job UNIQUE (thread_id, sync_job_id);

-- Add index for faster lookups (if not already exists)
CREATE INDEX IF NOT EXISTS idx_thread_stages_thread_job ON thread_processing_stages(thread_id, sync_job_id);

-- Add comment
COMMENT ON CONSTRAINT uniq_thread_per_job ON thread_processing_stages IS 
  'Ensures each thread can only be processed once per sync job, preventing duplicate processing';

