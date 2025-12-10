-- ============================================
-- COMPREHENSIVE CLEANUP: Fresh Start for Thread Sync
-- ============================================
-- This script removes ALL thread processing data to allow a fresh sync
-- Run this when you want to start completely fresh
-- ============================================

-- Step 1: Preview what will be deleted (RUN THIS FIRST TO SEE WHAT WILL BE CLEANED)
SELECT 
  'thread_processing_queue' as table_name,
  COUNT(*) FILTER (WHERE processed_at IS NULL) as pending,
  COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed,
  COUNT(*) as total
FROM thread_processing_queue
UNION ALL
SELECT 
  'thread_processing_stages' as table_name,
  COUNT(*) FILTER (WHERE current_stage != 'completed') as pending,
  COUNT(*) FILTER (WHERE current_stage = 'completed') as completed,
  COUNT(*) as total
FROM thread_processing_stages
UNION ALL
SELECT 
  'thread_summarization_queue' as table_name,
  COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) as pending,
  COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) as processed,
  COUNT(*) as total
FROM thread_summarization_queue
UNION ALL
SELECT 
  'sync_page_queue' as table_name,
  COUNT(*) FILTER (WHERE status IN ('pending', 'processing', 'retrying')) as pending,
  COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) as processed,
  COUNT(*) as total
FROM sync_page_queue
UNION ALL
SELECT 
  'sync_jobs' as table_name,
  COUNT(*) FILTER (WHERE status = 'running') as running,
  COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) as finished,
  COUNT(*) as total
FROM sync_jobs;

-- ============================================
-- Step 2: DELETE ALL PROCESSING DATA
-- ============================================
-- Run these in order (due to foreign key constraints)

-- 2a. Delete from thread_processing_queue (no dependencies)
DELETE FROM thread_processing_queue;

-- 2b. Delete from thread_summarization_queue (references thread_processing_stages)
DELETE FROM thread_summarization_queue;

-- 2c. Delete from thread_processing_stages (references sync_jobs)
DELETE FROM thread_processing_stages;

-- 2d. Delete from sync_page_queue (references sync_jobs)
DELETE FROM sync_page_queue;

-- 2e. (OPTIONAL) Mark all running sync_jobs as failed
-- Uncomment if you want to mark jobs as failed instead of deleting them
UPDATE sync_jobs
SET 
  status = 'failed',
  details = 'Manually stopped for fresh start'
WHERE status = 'running';

-- OR if you want to delete sync_jobs entirely (more aggressive):
-- DELETE FROM sync_jobs WHERE status = 'running';

-- ============================================
-- Step 3: VERIFICATION - Check cleanup results
-- ============================================
-- Run this after cleanup to verify everything is clean

SELECT 
  'thread_processing_queue' as table_name,
  COUNT(*) as remaining_count
FROM thread_processing_queue
UNION ALL
SELECT 
  'thread_processing_stages' as table_name,
  COUNT(*) as remaining_count
FROM thread_processing_stages
UNION ALL
SELECT 
  'thread_summarization_queue' as table_name,
  COUNT(*) as remaining_count
FROM thread_summarization_queue
UNION ALL
SELECT 
  'sync_page_queue' as table_name,
  COUNT(*) as remaining_count
FROM sync_page_queue
UNION ALL
SELECT 
  'sync_jobs (running)' as table_name,
  COUNT(*) as remaining_count
FROM sync_jobs
WHERE status = 'running';

-- ============================================
-- Step 4: (OPTIONAL) Clean up actual thread data
-- ============================================
-- Only run this if you want to delete the actual thread records from the threads table
-- WARNING: This will delete thread data that was successfully synced
-- Uncomment the lines below if you want a COMPLETE fresh start:

-- DELETE FROM thread_messages;
-- DELETE FROM thread_company_link;
-- DELETE FROM threads;

-- ============================================
-- NOTES:
-- ============================================
-- 1. This script does NOT delete data from the main tables:
--    - threads
--    - thread_messages
--    - thread_company_link
--    - profiles
--    - companies
--    - customers
--
-- 2. If you want to delete actual thread data too, uncomment Step 4
--
-- 3. After cleanup, you can start a new sync job which will:
--    - Create a new sync_job
--    - Create new thread_processing_stages entries
--    - Process threads from scratch
--
-- 4. The unique constraint on thread_processing_stages (thread_id, sync_job_id)
--    ensures that even if you sync the same threads again, they won't conflict
--    with previous sync jobs (since it's a new sync_job_id)

