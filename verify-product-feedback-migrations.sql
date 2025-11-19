-- Verification SQL for Product Feedback Feature Migrations
-- Run this in your Supabase SQL Editor to verify both migrations were applied successfully

-- ============================================
-- 1. Verify Schema Enhancement Migration
-- ============================================
-- Migration: 20251118233531_enhance_feature_requests_schema.sql

-- Check if thread_id column exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'feature_requests' 
      AND column_name = 'thread_id'
    ) THEN '✅ thread_id column exists'
    ELSE '❌ thread_id column MISSING'
  END AS thread_id_check;

-- Check if status column exists with correct constraint
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'feature_requests' 
      AND column_name = 'status'
    ) THEN '✅ status column exists'
    ELSE '❌ status column MISSING'
  END AS status_check;

-- Check if updated_at column exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'feature_requests' 
      AND column_name = 'updated_at'
    ) THEN '✅ updated_at column exists'
    ELSE '❌ updated_at column MISSING'
  END AS updated_at_check;

-- Check if 'thread' value exists in feature_request_source enum
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'thread' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'feature_request_source')
    ) THEN '✅ thread enum value exists'
    ELSE '❌ thread enum value MISSING'
  END AS enum_check;

-- Check if foreign key constraint exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_schema = 'public' 
      AND table_name = 'feature_requests' 
      AND constraint_name = 'feature_requests_thread_id_fkey'
    ) THEN '✅ thread_id foreign key exists'
    ELSE '❌ thread_id foreign key MISSING'
  END AS fkey_check;

-- Check if indexes exist
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename = 'feature_requests' 
      AND indexname = 'idx_feature_requests_thread_id'
    ) THEN '✅ idx_feature_requests_thread_id exists'
    ELSE '❌ idx_feature_requests_thread_id MISSING'
  END AS index_thread_check;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename = 'feature_requests' 
      AND indexname = 'idx_feature_requests_status'
    ) THEN '✅ idx_feature_requests_status exists'
    ELSE '❌ idx_feature_requests_status MISSING'
  END AS index_status_check;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename = 'feature_requests' 
      AND indexname = 'idx_feature_requests_company_status'
    ) THEN '✅ idx_feature_requests_company_status exists'
    ELSE '❌ idx_feature_requests_company_status MISSING'
  END AS index_company_status_check;

-- Check if trigger function exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'update_feature_requests_updated_at'
    ) THEN '✅ update_feature_requests_updated_at function exists'
    ELSE '❌ update_feature_requests_updated_at function MISSING'
  END AS trigger_function_check;

-- Check if trigger exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'trigger_update_feature_requests_updated_at'
    ) THEN '✅ trigger_update_feature_requests_updated_at trigger exists'
    ELSE '❌ trigger_update_feature_requests_updated_at trigger MISSING'
  END AS trigger_check;

-- ============================================
-- 2. Verify Function Fix Migration
-- ============================================
-- Migration: 20251118233555_fix_product_feedback_mapping.sql

-- Check if function exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'get_company_page_details'
    ) THEN '✅ get_company_page_details function exists'
    ELSE '❌ get_company_page_details function MISSING'
  END AS function_exists_check;

-- Get function definition to verify it includes product_feedback with proper mapping
SELECT 
  CASE 
    WHEN pg_get_functiondef(oid)::text LIKE '%product_feedback%' 
      AND pg_get_functiondef(oid)::text LIKE '%title%'
      AND pg_get_functiondef(oid)::text LIKE '%description%'
      AND pg_get_functiondef(oid)::text LIKE '%source%'
      AND pg_get_functiondef(oid)::text LIKE '%source_id%'
      AND pg_get_functiondef(oid)::text LIKE '%status%'
    THEN '✅ Function includes all required product_feedback fields'
    ELSE '❌ Function may be missing required fields'
  END AS function_content_check
FROM pg_proc 
WHERE proname = 'get_company_page_details';

-- ============================================
-- 3. Comprehensive Column Check
-- ============================================
-- List all columns in feature_requests table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'feature_requests'
ORDER BY ordinal_position;

-- ============================================
-- 4. Test Function Call (if you have a company_id)
-- ============================================
-- Uncomment and replace with an actual company_id to test the function
/*
SELECT 
  jsonb_pretty(
    get_company_page_details('YOUR_COMPANY_ID_HERE')::jsonb
  ) AS function_test;
*/

-- ============================================
-- 5. Summary Report
-- ============================================
SELECT 
  'Migration Verification Summary' AS report,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = 'public' 
   AND table_name = 'feature_requests' 
   AND column_name IN ('thread_id', 'status', 'updated_at')) AS new_columns_count,
  (SELECT COUNT(*) FROM pg_indexes 
   WHERE schemaname = 'public' 
   AND tablename = 'feature_requests' 
   AND indexname LIKE 'idx_feature_requests%') AS indexes_count,
  (SELECT COUNT(*) FROM pg_trigger 
   WHERE tgname = 'trigger_update_feature_requests_updated_at') AS trigger_count,
  (SELECT COUNT(*) FROM pg_proc 
   WHERE proname = 'get_company_page_details') AS function_count,
  (SELECT COUNT(*) FROM pg_enum 
   WHERE enumlabel = 'thread' 
   AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'feature_request_source')) AS enum_thread_count;

