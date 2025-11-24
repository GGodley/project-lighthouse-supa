-- Diagnostic query to check why meetings aren't appearing in interaction timeline
-- Replace 'YOUR_COMPANY_ID' with the actual company_id you're testing

-- Step 1: Check if meetings exist with summaries for this company
SELECT 
  m.google_event_id,
  m.title,
  m.summary,
  m.start_time,
  m.customer_id,
  c.customer_id as customer_exists,
  c.company_id,
  CASE 
    WHEN m.summary IS NULL THEN '❌ Missing summary'
    WHEN m.start_time IS NULL THEN '❌ Missing start_time'
    WHEN m.customer_id IS NULL THEN '❌ Missing customer_id'
    WHEN c.customer_id IS NULL THEN '❌ Customer not found'
    WHEN c.company_id IS NULL THEN '❌ Customer has no company_id'
    WHEN c.company_id != 'YOUR_COMPANY_ID'::uuid THEN '⚠️ Customer belongs to different company'
    ELSE '✅ Should appear in timeline'
  END as status
FROM meetings m
LEFT JOIN customers c ON m.customer_id = c.customer_id
WHERE m.summary IS NOT NULL
ORDER BY m.start_time DESC
LIMIT 20;

-- Step 2: Check what the function returns for a specific company
-- Replace 'YOUR_COMPANY_ID' with the actual company_id
SELECT 
  interaction_type,
  interaction_date,
  id,
  title,
  summary,
  sentiment
FROM json_array_elements(
  get_company_page_details('YOUR_COMPANY_ID'::uuid)->'interaction_timeline'
) AS interaction
ORDER BY (interaction->>'interaction_date') DESC;

-- Step 3: Check all customers for a company and their meetings
-- Replace 'YOUR_COMPANY_ID' with the actual company_id
SELECT 
  c.customer_id,
  c.email,
  c.company_id,
  COUNT(m.google_event_id) as total_meetings,
  COUNT(CASE WHEN m.summary IS NOT NULL THEN 1 END) as meetings_with_summary,
  COUNT(CASE WHEN m.summary IS NOT NULL AND m.start_time IS NOT NULL THEN 1 END) as meetings_ready_for_timeline
FROM customers c
LEFT JOIN meetings m ON c.customer_id = m.customer_id
WHERE c.company_id = 'YOUR_COMPANY_ID'::uuid
GROUP BY c.customer_id, c.email, c.company_id;

