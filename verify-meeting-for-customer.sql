-- Verify meeting data for customer_id: 0c085704-ae06-4c82-8149-3e17420c5075
-- Run these queries in Supabase SQL Editor

-- STEP 1: Check the customer and their company
SELECT 
  c.customer_id,
  c.email,
  c.company_id,
  comp.company_id as company_exists,
  comp.company_name
FROM customers c
LEFT JOIN companies comp ON c.company_id = comp.company_id
WHERE c.customer_id = '0c085704-ae06-4c82-8149-3e17420c5075'::uuid;

-- STEP 2: Find all meetings for this customer
SELECT 
  m.google_event_id,
  m.title,
  m.summary,
  m.start_time,
  m.customer_id,
  m.customer_sentiment,
  -- Check each condition
  CASE WHEN m.summary IS NOT NULL THEN '✅' ELSE '❌' END as has_summary,
  CASE WHEN m.summary != '' THEN '✅' ELSE '❌' END as summary_not_empty,
  CASE WHEN m.start_time IS NOT NULL THEN '✅' ELSE '❌' END as has_start_time,
  CASE WHEN m.customer_id IS NOT NULL THEN '✅' ELSE '❌' END as has_customer_id,
  -- Overall status
  CASE 
    WHEN m.summary IS NULL THEN '❌ Missing summary'
    WHEN m.summary = '' THEN '❌ Empty summary'
    WHEN m.start_time IS NULL THEN '❌ Missing start_time'
    WHEN m.customer_id IS NULL THEN '❌ Missing customer_id'
    ELSE '✅ Ready for timeline'
  END as status
FROM meetings m
WHERE m.customer_id = '0c085704-ae06-4c82-8149-3e17420c5075'::uuid
ORDER BY m.start_time DESC;

-- STEP 3: Test the EXACT query used in get_company_page_details function
-- First, get the company_id from the customer
WITH customer_company AS (
  SELECT company_id 
  FROM customers 
  WHERE customer_id = '0c085704-ae06-4c82-8149-3e17420c5075'::uuid
)
SELECT 
  'meeting'::text as interaction_type,
  m.start_time as interaction_date,
  m.google_event_id as id,
  m.title,
  m.summary,
  COALESCE(m.customer_sentiment, 'Neutral') as sentiment,
  -- Show why it might be excluded
  CASE 
    WHEN m.summary IS NULL THEN '❌ Excluded: summary IS NULL'
    WHEN m.summary = '' THEN '❌ Excluded: summary is empty string'
    WHEN m.start_time IS NULL THEN '❌ Excluded: start_time IS NULL'
    WHEN m.customer_id IS NULL THEN '❌ Excluded: customer_id IS NULL'
    WHEN c.customer_id IS NULL THEN '❌ Excluded: customer not found'
    WHEN c.company_id IS NULL THEN '❌ Excluded: customer has no company_id'
    WHEN c.company_id != (SELECT company_id FROM customer_company) THEN '❌ Excluded: wrong company_id'
    ELSE '✅ Should appear in timeline'
  END as inclusion_status
FROM meetings m
JOIN customers c ON m.customer_id = c.customer_id
CROSS JOIN customer_company cc
WHERE m.customer_id = '0c085704-ae06-4c82-8149-3e17420c5075'::uuid
  AND c.company_id = cc.company_id
  AND m.summary IS NOT NULL
  AND m.start_time IS NOT NULL
ORDER BY m.start_time DESC;

-- STEP 4: Test the full function with the company_id
-- Replace 'COMPANY_ID_HERE' with the company_id from STEP 1
SELECT 
  interaction_type,
  interaction_date,
  id,
  title,
  LEFT(summary, 200) as summary_preview,
  sentiment
FROM json_array_elements(
  get_company_page_details('COMPANY_ID_HERE'::uuid)->'interaction_timeline'
) AS interaction
WHERE (interaction->>'interaction_type') = 'meeting'
ORDER BY (interaction->>'interaction_date') DESC;

-- STEP 5: Simplified version - just the meetings query part
-- This shows exactly what the function returns for meetings
WITH customer_company AS (
  SELECT company_id 
  FROM customers 
  WHERE customer_id = '0c085704-ae06-4c82-8149-3e17420c5075'::uuid
)
SELECT 
  'meeting'::text as interaction_type,
  m.start_time as interaction_date,
  m.google_event_id as id,
  m.title,
  m.summary,
  COALESCE(m.customer_sentiment, 'Neutral') as sentiment
FROM meetings m
JOIN customers c ON m.customer_id = c.customer_id
CROSS JOIN customer_company cc
WHERE c.company_id = cc.company_id
  AND m.summary IS NOT NULL
  AND m.start_time IS NOT NULL
ORDER BY m.start_time DESC;

