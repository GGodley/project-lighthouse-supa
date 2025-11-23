-- Verify that next steps from both threads and meetings are included
-- Run this in Supabase SQL Editor

-- STEP 1: Check what next steps exist in the database
SELECT 
  source_type,
  COUNT(*) as count,
  COUNT(DISTINCT company_id) as unique_companies,
  COUNT(DISTINCT source_id) as unique_sources
FROM next_steps
GROUP BY source_type
ORDER BY source_type;

-- STEP 2: Test the function for a specific company
-- Replace 'YOUR_COMPANY_ID' with an actual company_id
WITH company_data AS (
  SELECT get_company_page_details('YOUR_COMPANY_ID'::uuid) as data
)
SELECT 
  step->>'id' as id,
  step->>'text' as text,
  step->>'source_type' as source_type,
  step->>'completed' as completed,
  step->>'owner' as owner,
  step->>'due_date' as due_date
FROM company_data,
json_array_elements(company_data.data->'next_steps') AS step
ORDER BY (step->>'source_type'), (step->>'created_at') DESC;

-- STEP 3: Verify both thread and meeting next steps are returned
-- Replace 'YOUR_COMPANY_ID' with an actual company_id
SELECT 
  'Total next steps' as metric,
  COUNT(*) as count
FROM json_array_elements(
  get_company_page_details('YOUR_COMPANY_ID'::uuid)->'next_steps'
) AS step
UNION ALL
SELECT 
  'Thread next steps' as metric,
  COUNT(*) as count
FROM json_array_elements(
  get_company_page_details('YOUR_COMPANY_ID'::uuid)->'next_steps'
) AS step
WHERE step->>'source_type' = 'thread'
UNION ALL
SELECT 
  'Meeting next steps' as metric,
  COUNT(*) as count
FROM json_array_elements(
  get_company_page_details('YOUR_COMPANY_ID'::uuid)->'next_steps'
) AS step
WHERE step->>'source_type' = 'meeting';

-- STEP 4: Check if there are meetings with next_steps that haven't been extracted
SELECT 
  COUNT(*) as meetings_with_next_steps_not_extracted,
  'Meetings with next_steps that may not be in next_steps table' as description
FROM meetings m
JOIN customers c ON m.customer_id = c.customer_id
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

-- STEP 5: Check if there are threads with next_steps that haven't been extracted
SELECT 
  COUNT(*) as threads_with_next_steps_not_extracted,
  'Threads with next_steps that may not be in next_steps table' as description
FROM threads t
JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
WHERE t.llm_summary IS NOT NULL
  AND (
    (t.llm_summary->>'csm_next_step' IS NOT NULL AND t.llm_summary->>'csm_next_step' != '')
    OR (t.llm_summary->'next_steps' IS NOT NULL AND jsonb_array_length(t.llm_summary->'next_steps') > 0)
  )
  AND NOT EXISTS (
    SELECT 1 FROM next_steps ns
    WHERE ns.source_type = 'thread'
      AND ns.source_id = t.thread_id
      AND ns.company_id = tcl.company_id
  );

