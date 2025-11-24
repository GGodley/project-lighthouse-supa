-- Verification Script for last_interaction_at Migration
-- This script verifies that the migration was applied successfully
-- Run this after applying the migration to confirm everything is working

-- 1. Check if the function exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
      AND p.proname = 'update_company_last_interaction_at'
    ) THEN '✅ Function update_company_last_interaction_at exists'
    ELSE '❌ Function update_company_last_interaction_at NOT FOUND'
  END as function_check;

-- 2. Check if trigger functions exist
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
      AND p.proname = 'update_company_last_interaction_on_thread_change'
    ) THEN '✅ Trigger function update_company_last_interaction_on_thread_change exists'
    ELSE '❌ Trigger function update_company_last_interaction_on_thread_change NOT FOUND'
  END as thread_trigger_function_check;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
      AND p.proname = 'update_company_last_interaction_on_link_change'
    ) THEN '✅ Trigger function update_company_last_interaction_on_link_change exists'
    ELSE '❌ Trigger function update_company_last_interaction_on_link_change NOT FOUND'
  END as link_trigger_function_check;

-- 3. Check if triggers exist on tables
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' 
      AND c.relname = 'threads'
      AND t.tgname = 'update_company_last_interaction_on_thread_change'
    ) THEN '✅ Trigger on threads table exists'
    ELSE '❌ Trigger on threads table NOT FOUND'
  END as threads_trigger_check;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' 
      AND c.relname = 'thread_company_link'
      AND t.tgname = 'update_company_last_interaction_on_link_change'
    ) THEN '✅ Trigger on thread_company_link table exists'
    ELSE '❌ Trigger on thread_company_link table NOT FOUND'
  END as link_trigger_check;

-- 4. Verify data: Check companies with last_interaction_at populated
SELECT 
  COUNT(*) as total_companies,
  COUNT(last_interaction_at) as companies_with_last_interaction,
  COUNT(*) - COUNT(last_interaction_at) as companies_without_last_interaction
FROM public.companies;

-- 5. Verify data: Compare calculated vs stored last_interaction_at for sample companies
-- This shows companies that have threads and their calculated last_interaction_at
SELECT 
  c.company_id,
  c.company_name,
  c.last_interaction_at as stored_last_interaction,
  MAX(t.last_message_date) as calculated_last_interaction,
  CASE 
    WHEN c.last_interaction_at IS NULL AND MAX(t.last_message_date) IS NOT NULL THEN '⚠️ Missing - should be updated'
    WHEN c.last_interaction_at IS NOT NULL AND MAX(t.last_message_date) IS NULL THEN '⚠️ Has value but no threads'
    WHEN c.last_interaction_at = MAX(t.last_message_date) THEN '✅ Matches'
    WHEN c.last_interaction_at IS NULL AND MAX(t.last_message_date) IS NULL THEN 'ℹ️ No threads'
    ELSE '⚠️ Mismatch'
  END as status
FROM public.companies c
LEFT JOIN public.thread_company_link tcl ON c.company_id = tcl.company_id
LEFT JOIN public.threads t ON tcl.thread_id = t.thread_id AND t.last_message_date IS NOT NULL
GROUP BY c.company_id, c.company_name, c.last_interaction_at
ORDER BY calculated_last_interaction DESC NULLS LAST
LIMIT 20;

-- 6. Test the function manually for a specific company (replace with actual company_id)
-- Uncomment and replace 'YOUR_COMPANY_ID_HERE' with an actual company_id to test
/*
DO $$
DECLARE
  test_company_id UUID := 'YOUR_COMPANY_ID_HERE';
  before_value TIMESTAMPTZ;
  after_value TIMESTAMPTZ;
BEGIN
  SELECT last_interaction_at INTO before_value
  FROM public.companies
  WHERE company_id = test_company_id;
  
  PERFORM public.update_company_last_interaction_at(test_company_id);
  
  SELECT last_interaction_at INTO after_value
  FROM public.companies
  WHERE company_id = test_company_id;
  
  RAISE NOTICE 'Company: %', test_company_id;
  RAISE NOTICE 'Before: %', before_value;
  RAISE NOTICE 'After: %', after_value;
  RAISE NOTICE 'Updated: %', (after_value IS DISTINCT FROM before_value);
END $$;
*/

-- 7. Summary: Companies with threads but no last_interaction_at (should be 0 after backfill)
SELECT 
  COUNT(DISTINCT c.company_id) as companies_with_threads_but_no_last_interaction
FROM public.companies c
INNER JOIN public.thread_company_link tcl ON c.company_id = tcl.company_id
INNER JOIN public.threads t ON tcl.thread_id = t.thread_id
WHERE t.last_message_date IS NOT NULL
  AND c.last_interaction_at IS NULL;

-- Expected Results:
-- 1. All functions and triggers should exist (✅)
-- 2. Companies with threads should have last_interaction_at populated
-- 3. The last query should return 0 (or very close to 0 if new threads were just added)

