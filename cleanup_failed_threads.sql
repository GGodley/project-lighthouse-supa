-- ============================================
-- CLEANUP SCRIPT: Remove Failed/Incomplete Thread Processing
-- ============================================
-- This script removes all threads that were not successfully processed
-- Use this to start fresh after fixing issues
--
-- SAFE TO RUN: Only deletes processing records, not the actual threads table
-- ============================================

-- Step 1: Check what will be deleted (PREVIEW)
-- Run this first to see what will be cleaned up
SELECT 
  'thread_processing_stages' as table_name,
  current_stage,
  COUNT(*) as count
FROM thread_processing_stages
WHERE current_stage IN ('failed', 'pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing')
GROUP BY current_stage
ORDER BY current_stage;

-- Step 2: Delete from thread_processing_queue (related queue entries)
-- This must be done first due to foreign key constraints
DELETE FROM thread_processing_queue
WHERE thread_stage_id IN (
  SELECT id 
  FROM thread_processing_stages
  WHERE current_stage IN ('failed', 'pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing')
);

-- Step 3: Delete from thread_summarization_queue (related summarization jobs)
DELETE FROM thread_summarization_queue
WHERE thread_stage_id IN (
  SELECT id 
  FROM thread_processing_stages
  WHERE current_stage IN ('failed', 'pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing')
);

-- Step 4: Delete from thread_processing_stages (the main processing records)
DELETE FROM thread_processing_stages
WHERE current_stage IN ('failed', 'pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing');

-- Step 5: (OPTIONAL) Clean up actual threads table if they were partially created
-- Only run this if you want to delete the actual thread records too
-- WARNING: This will delete thread data from the threads table
-- Uncomment the lines below if you want to delete actual thread records:

-- DELETE FROM thread_messages
-- WHERE thread_id IN (
--   SELECT thread_id 
--   FROM threads
--   WHERE thread_id NOT IN (
--     SELECT DISTINCT thread_id 
--     FROM thread_processing_stages 
--     WHERE current_stage = 'completed'
--   )
-- );

-- DELETE FROM thread_company_link
-- WHERE thread_id IN (
--   SELECT thread_id 
--   FROM threads
--   WHERE thread_id NOT IN (
--     SELECT DISTINCT thread_id 
--     FROM thread_processing_stages 
--     WHERE current_stage = 'completed'
--   )
-- );

-- DELETE FROM threads
-- WHERE thread_id NOT IN (
--   SELECT DISTINCT thread_id 
--   FROM thread_processing_stages 
--   WHERE current_stage = 'completed'
-- );

-- ============================================
-- VERIFICATION: Check cleanup results
-- ============================================
SELECT 
  'Remaining processing stages' as check_type,
  current_stage,
  COUNT(*) as count
FROM thread_processing_stages
GROUP BY current_stage
ORDER BY current_stage;

SELECT 
  'Remaining queue entries' as check_type,
  COUNT(*) FILTER (WHERE processed_at IS NULL) as pending,
  COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed,
  COUNT(*) as total
FROM thread_processing_queue;

