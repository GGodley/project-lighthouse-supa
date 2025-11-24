-- Diagnostic queries to find why meetings aren't appearing in interaction timeline
-- Run these in Supabase SQL Editor to debug

-- STEP 1: Find the meeting you're looking for
-- Replace 'YOUR_MEETING_TITLE' or 'YOUR_GOOGLE_EVENT_ID' with actual values
SELECT 
  m.google_event_id,
  m.title,
  m.summary,
  m.start_time,
  m.customer_id,
  m.user_id,
  CASE 
    WHEN m.summary IS NULL THEN '❌ No summary'
    WHEN m.summary = '' THEN '❌ Empty summary'
    WHEN m.start_time IS NULL THEN '❌ No start_time'
    WHEN m.customer_id IS NULL THEN '❌ No customer_id'
    ELSE '✅ Meeting data looks good'
  END as meeting_status
FROM meetings m
WHERE m.title ILIKE '%YOUR_MEETING_TITLE%'  -- Replace with actual meeting title
   OR m.google_event_id = 'YOUR_GOOGLE_EVENT_ID'  -- Or replace with actual google_event_id
ORDER BY m.start_time DESC
LIMIT 5;

-- STEP 2: Check if the meeting's customer exists and is linked to a company
-- Replace 'MEETING_CUSTOMER_ID' with the customer_id from Step 1
SELECT 
  c.customer_id,
  c.email,
  c.company_id,
  CASE 
    WHEN c.customer_id IS NULL THEN '❌ Customer not found'
    WHEN c.company_id IS NULL THEN '❌ Customer has no company_id'
    ELSE '✅ Customer linked to company'
  END as customer_status
FROM customers c
WHERE c.customer_id = 'MEETING_CUSTOMER_ID'::uuid;  -- Replace with actual customer_id

-- STEP 3: Check what company_id the customer belongs to
-- Replace 'MEETING_CUSTOMER_ID' with the customer_id from Step 1
SELECT 
  c.customer_id,
  c.email,
  c.company_id,
  comp.company_id as company_exists,
  comp.company_name
FROM customers c
LEFT JOIN companies comp ON c.company_id = comp.company_id
WHERE c.customer_id = 'MEETING_CUSTOMER_ID'::uuid;  -- Replace with actual customer_id

-- STEP 4: Test the actual function with the company_id
-- Replace 'COMPANY_ID_FROM_STEP_3' with the company_id from Step 3
SELECT 
  interaction_type,
  interaction_date,
  id,
  title,
  LEFT(summary, 100) as summary_preview,
  sentiment
FROM json_array_elements(
  get_company_page_details('COMPANY_ID_FROM_STEP_3'::uuid)->'interaction_timeline'
) AS interaction
ORDER BY (interaction->>'interaction_date') DESC;

-- STEP 5: Direct query to see what meetings should appear for a company
-- Replace 'COMPANY_ID_FROM_STEP_3' with the company_id from Step 3
SELECT 
  m.google_event_id,
  m.title,
  m.summary IS NOT NULL AND m.summary != '' as has_valid_summary,
  m.start_time IS NOT NULL as has_start_time,
  m.customer_id IS NOT NULL as has_customer_id,
  c.customer_id as customer_exists,
  c.company_id,
  CASE 
    WHEN m.summary IS NULL OR m.summary = '' THEN '❌ Missing or empty summary'
    WHEN m.start_time IS NULL THEN '❌ Missing start_time'
    WHEN m.customer_id IS NULL THEN '❌ Missing customer_id'
    WHEN c.customer_id IS NULL THEN '❌ Customer not found'
    WHEN c.company_id IS NULL THEN '❌ Customer has no company_id'
    WHEN c.company_id != 'COMPANY_ID_FROM_STEP_3'::uuid THEN '⚠️ Customer belongs to different company'
    ELSE '✅ Should appear in timeline'
  END as status
FROM meetings m
LEFT JOIN customers c ON m.customer_id = c.customer_id
WHERE c.company_id = 'COMPANY_ID_FROM_STEP_3'::uuid  -- Replace with actual company_id
  AND m.summary IS NOT NULL
  AND m.summary != ''
  AND m.start_time IS NOT NULL
ORDER BY m.start_time DESC;

