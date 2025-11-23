-- Verification script to check if meeting summaries and next steps are working
-- Run this in Supabase SQL Editor

-- STEP 1: Verify the migration has been applied
-- Check if the function has the meeting filters
SELECT 
  CASE 
    WHEN prosrc LIKE '%m.summary IS NOT NULL%' 
     AND prosrc LIKE '%m.start_time IS NOT NULL%' 
    THEN '✅ Migration applied - filters present'
    ELSE '❌ Migration NOT applied - filters missing'
  END as migration_status,
  proname as function_name
FROM pg_proc 
WHERE proname = 'get_company_page_details';

-- STEP 2: Check if next steps triggers exist
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  tgenabled as is_enabled,
  CASE 
    WHEN tgenabled = 'O' THEN '✅ Trigger is enabled'
    ELSE '❌ Trigger is disabled'
  END as trigger_status
FROM pg_trigger
WHERE tgname IN ('process_meeting_next_steps_trigger', 'process_thread_next_steps_trigger');

-- STEP 3: Check if next steps function exists
SELECT 
  proname as function_name,
  CASE 
    WHEN proname = 'trigger_process_meeting_next_steps' THEN '✅ Meeting next steps function exists'
    WHEN proname = 'trigger_process_thread_next_steps' THEN '✅ Thread next steps function exists'
    ELSE 'Function exists'
  END as function_status
FROM pg_proc
WHERE proname IN ('trigger_process_meeting_next_steps', 'trigger_process_thread_next_steps');

-- STEP 4: Check how many meetings have next_steps but aren't in next_steps table
-- Replace 'YOUR_COMPANY_ID' with an actual company_id to test
WITH company_customers AS (
  SELECT customer_id 
  FROM customers 
  WHERE company_id = 'YOUR_COMPANY_ID'::uuid  -- Replace with actual company_id
)
SELECT 
  COUNT(*) as meetings_with_next_steps_not_extracted,
  'Meetings with next_steps that may not be in next_steps table' as description
FROM meetings m
JOIN company_customers cc ON m.customer_id = cc.customer_id
WHERE m.next_steps IS NOT NULL
  AND (
    (jsonb_typeof(m.next_steps) = 'array' AND jsonb_array_length(m.next_steps) > 0)
    OR (jsonb_typeof(m.next_steps) = 'string' AND m.next_steps::text != '')
  )
  AND NOT EXISTS (
    SELECT 1 FROM next_steps ns
    WHERE ns.source_type = 'meeting'
      AND ns.source_id = m.google_event_id
  );

-- STEP 5: Sample query to see meetings with summaries for a company
-- Replace 'YOUR_COMPANY_ID' with an actual company_id
SELECT 
  m.google_event_id,
  m.title,
  m.summary IS NOT NULL AND m.summary != '' as has_summary,
  m.next_steps IS NOT NULL as has_next_steps,
  m.start_time,
  c.company_id
FROM meetings m
JOIN customers c ON m.customer_id = c.customer_id
WHERE c.company_id = 'YOUR_COMPANY_ID'::uuid  -- Replace with actual company_id
  AND m.summary IS NOT NULL
  AND m.summary != ''
ORDER BY m.start_time DESC
LIMIT 10;

