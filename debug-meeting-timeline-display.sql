-- Debug script to check why meetings aren't appearing in interaction timeline
-- Run this in Supabase SQL Editor

-- STEP 1: Check if the migration has been applied
SELECT 
  CASE 
    WHEN prosrc LIKE '%m.summary IS NOT NULL%' 
     AND prosrc LIKE '%m.start_time IS NOT NULL%' 
    THEN '✅ Migration applied - filters present'
    ELSE '❌ Migration NOT applied - filters missing'
  END as migration_status
FROM pg_proc 
WHERE proname = 'get_company_page_details';

-- STEP 2: Check meetings with summaries for a specific company
-- Replace 'YOUR_COMPANY_ID' with an actual company_id
SELECT 
  m.google_event_id,
  m.title,
  m.summary IS NOT NULL AND m.summary != '' as has_summary,
  m.start_time IS NOT NULL as has_start_time,
  m.customer_id,
  c.company_id,
  CASE 
    WHEN m.summary IS NULL OR m.summary = '' THEN '❌ Missing or empty summary'
    WHEN m.start_time IS NULL THEN '❌ Missing start_time'
    WHEN m.customer_id IS NULL THEN '❌ Missing customer_id'
    WHEN c.customer_id IS NULL THEN '❌ Customer not found'
    WHEN c.company_id IS NULL THEN '❌ Customer has no company_id'
    WHEN c.company_id != 'YOUR_COMPANY_ID'::uuid THEN '⚠️ Customer belongs to different company'
    ELSE '✅ Should appear in timeline'
  END as status
FROM meetings m
LEFT JOIN customers c ON m.customer_id = c.customer_id
WHERE c.company_id = 'YOUR_COMPANY_ID'::uuid  -- Replace with actual company_id
ORDER BY m.start_time DESC
LIMIT 20;

-- STEP 3: Test the function directly
-- Replace 'YOUR_COMPANY_ID' with an actual company_id
SELECT 
  interaction->>'interaction_type' as type,
  interaction->>'title' as title,
  LEFT(interaction->>'summary', 100) as summary_preview,
  interaction->>'interaction_date' as date
FROM json_array_elements(
  get_company_page_details('YOUR_COMPANY_ID'::uuid)->'interaction_timeline'
) AS interaction
ORDER BY (interaction->>'interaction_date') DESC;

-- STEP 4: Count interactions by type
-- Replace 'YOUR_COMPANY_ID' with an actual company_id
SELECT 
  interaction->>'interaction_type' as type,
  COUNT(*) as count
FROM json_array_elements(
  get_company_page_details('YOUR_COMPANY_ID'::uuid)->'interaction_timeline'
) AS interaction
GROUP BY interaction->>'interaction_type';

