-- Verification SQL for company_id in product_feedback response migration
-- Migration: 20251119000000_add_company_id_to_product_feedback_response.sql
-- Run this in your Supabase SQL Editor to verify the migration was applied successfully

-- ============================================
-- 1. Verify Function Returns company_id
-- ============================================

-- Test the function with a sample company_id
-- Replace 'YOUR_COMPANY_ID_HERE' with an actual company_id from your database
DO $$
DECLARE
  test_company_id uuid;
  function_result json;
  product_feedback json;
  feedback_item json;
  has_company_id boolean := false;
BEGIN
  -- Get the first company_id that has feature requests
  SELECT fr.company_id INTO test_company_id
  FROM feature_requests fr
  LIMIT 1;
  
  IF test_company_id IS NULL THEN
    RAISE NOTICE 'No companies with feature requests found. Skipping test.';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing with company_id: %', test_company_id;
  
  -- Call the function
  SELECT get_company_page_details(test_company_id) INTO function_result;
  
  -- Extract product_feedback array
  product_feedback := function_result->'product_feedback';
  
  -- Check if product_feedback exists and has items
  IF product_feedback IS NULL OR json_array_length(product_feedback) = 0 THEN
    RAISE NOTICE 'No product feedback found for this company.';
    RETURN;
  END IF;
  
  -- Check first item for company_id field
  feedback_item := product_feedback->0;
  
  IF feedback_item ? 'company_id' THEN
    has_company_id := true;
    RAISE NOTICE '✅ SUCCESS: company_id field exists in product_feedback response';
    RAISE NOTICE '   company_id value: %', feedback_item->>'company_id';
  ELSE
    RAISE NOTICE '❌ FAIL: company_id field MISSING in product_feedback response';
  END IF;
  
END $$;

-- ============================================
-- 2. Verify Function Structure
-- ============================================

-- Check if function exists and get its definition
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'get_company_page_details'
    ) THEN '✅ Function exists'
    ELSE '❌ Function MISSING'
  END AS function_check;

-- Check if function definition includes company_id in product_feedback
SELECT 
  CASE 
    WHEN pg_get_functiondef(oid)::text LIKE '%product_feedback%' 
      AND pg_get_functiondef(oid)::text LIKE '%company_id%'
      AND pg_get_functiondef(oid)::text LIKE '%fr.company_id%'
    THEN '✅ Function includes company_id in product_feedback'
    ELSE '❌ Function may be missing company_id in product_feedback'
  END AS function_content_check
FROM pg_proc 
WHERE proname = 'get_company_page_details';

-- ============================================
-- 3. Test with Actual Data
-- ============================================

-- Get a sample result to inspect
-- Replace with an actual company_id, or this will return NULL if no company has feature requests
SELECT 
  'Sample Function Result' AS test_name,
  jsonb_pretty(
    get_company_page_details(
      (SELECT fr.company_id FROM feature_requests fr LIMIT 1)
    )::jsonb
  ) AS function_result
WHERE EXISTS (SELECT 1 FROM feature_requests LIMIT 1);

-- ============================================
-- 4. Verify All Required Fields in Response
-- ============================================

-- Check what fields are returned in product_feedback
SELECT 
  'Field Verification' AS check_type,
  jsonb_object_keys(
    (get_company_page_details(
      (SELECT fr.company_id FROM feature_requests fr LIMIT 1)
    )::jsonb->'product_feedback'->0)::jsonb
  ) AS field_name
WHERE EXISTS (SELECT 1 FROM feature_requests LIMIT 1);

-- ============================================
-- 5. Comprehensive Verification
-- ============================================

-- Summary check
SELECT 
  'Migration Verification Summary' AS report,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'get_company_page_details') AS function_exists,
  (SELECT COUNT(*) FROM feature_requests) AS total_feature_requests,
  (SELECT COUNT(DISTINCT company_id) FROM feature_requests) AS companies_with_feedback,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'get_company_page_details'
      AND pg_get_functiondef(oid)::text LIKE '%fr.company_id%'
    ) THEN '✅ company_id included'
    ELSE '❌ company_id MISSING'
  END AS company_id_in_function;

-- ============================================
-- 6. Manual Inspection Query
-- ============================================

-- Use this query to manually inspect the function response
-- Replace 'YOUR_COMPANY_ID' with an actual company_id
/*
SELECT 
  jsonb_pretty(
    (get_company_page_details('YOUR_COMPANY_ID'::uuid)::jsonb->'product_feedback')::jsonb
  ) AS product_feedback_with_company_id;
*/

-- Expected result: Each item in the product_feedback array should have:
-- - id
-- - title
-- - description
-- - urgency
-- - status
-- - source
-- - source_id
-- - source_type
-- - company_id  <-- This is the new field we're verifying
-- - created_at
-- - updated_at

