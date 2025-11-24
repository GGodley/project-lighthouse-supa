-- Test query to debug why meetings aren't appearing
-- Replace 'YOUR_COMPANY_ID' with the actual company_id

-- First, let's see all meetings with summaries and their customer/company relationships
SELECT 
  m.google_event_id,
  m.title,
  m.summary IS NOT NULL as has_summary,
  m.start_time IS NOT NULL as has_start_time,
  m.customer_id,
  c.customer_id as customer_exists,
  c.company_id,
  CASE 
    WHEN m.customer_id IS NULL THEN '❌ Meeting has NULL customer_id'
    WHEN c.customer_id IS NULL THEN '❌ Customer not found in customers table'
    WHEN c.company_id IS NULL THEN '❌ Customer has NULL company_id'
    WHEN c.company_id != 'YOUR_COMPANY_ID'::uuid THEN '⚠️ Customer belongs to different company'
    WHEN m.summary IS NULL THEN '❌ Meeting has no summary'
    WHEN m.start_time IS NULL THEN '❌ Meeting has no start_time'
    ELSE '✅ Should appear in timeline'
  END as status
FROM meetings m
LEFT JOIN customers c ON m.customer_id = c.customer_id
WHERE m.summary IS NOT NULL
ORDER BY m.start_time DESC
LIMIT 20;

-- Now test the actual function query for a specific company
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
WHERE (interaction->>'interaction_type') = 'meeting'
ORDER BY (interaction->>'interaction_date') DESC;

