-- Extract next steps from existing meetings that haven't been extracted yet
-- This is a one-time script to backfill next steps from meetings
-- Run this in Supabase SQL Editor

-- Extract next steps from meetings (handle both old string format and new JSONB format)
-- Only insert if they don't already exist in next_steps table
INSERT INTO public.next_steps (company_id, text, completed, owner, due_date, source_type, source_id, user_id, created_at)
SELECT DISTINCT
  c.company_id,
  CASE
    -- New JSONB array format
    WHEN jsonb_typeof(m.next_steps) = 'array' AND jsonb_array_length(m.next_steps) > 0
    THEN m.next_steps->0->>'text'
    -- Legacy string format
    WHEN jsonb_typeof(m.next_steps) = 'string'
    THEN m.next_steps::text
    ELSE NULL
  END as text,
  false as completed,
  CASE
    WHEN jsonb_typeof(m.next_steps) = 'array' AND jsonb_array_length(m.next_steps) > 0
    THEN m.next_steps->0->>'owner'
    ELSE NULL
  END as owner,
  CASE
    WHEN jsonb_typeof(m.next_steps) = 'array' 
      AND jsonb_array_length(m.next_steps) > 0
      AND m.next_steps->0->>'due_date' IS NOT NULL
    THEN (m.next_steps->0->>'due_date')::timestamptz
    ELSE NULL
  END as due_date,
  'meeting' as source_type,
  m.google_event_id as source_id,
  m.user_id,
  COALESCE(m.updated_at, m.created_at) as created_at
FROM meetings m
JOIN customers c ON m.customer_id = c.customer_id
WHERE m.next_steps IS NOT NULL
  AND (
    (jsonb_typeof(m.next_steps) = 'string' AND m.next_steps::text != '')
    OR (jsonb_typeof(m.next_steps) = 'array' AND jsonb_array_length(m.next_steps) > 0)
  )
  -- Avoid duplicates - only insert if not already in next_steps table
  AND NOT EXISTS (
    SELECT 1 FROM next_steps ns
    WHERE ns.source_type = 'meeting'
      AND ns.source_id = m.google_event_id
      AND ns.company_id = c.company_id
      AND ns.text = CASE
        WHEN jsonb_typeof(m.next_steps) = 'array' AND jsonb_array_length(m.next_steps) > 0
        THEN m.next_steps->0->>'text'
        WHEN jsonb_typeof(m.next_steps) = 'string'
        THEN m.next_steps::text
        ELSE NULL
      END
  );

-- For meetings with multiple next steps in the new format, insert each one
INSERT INTO public.next_steps (company_id, text, completed, owner, due_date, source_type, source_id, user_id, created_at)
SELECT DISTINCT
  c.company_id,
  step->>'text' as text,
  false as completed,
  step->>'owner' as owner,
  CASE 
    WHEN step->>'due_date' IS NOT NULL 
    THEN (step->>'due_date')::timestamptz
    ELSE NULL
  END as due_date,
  'meeting' as source_type,
  m.google_event_id as source_id,
  m.user_id,
  COALESCE(m.updated_at, m.created_at) as created_at
FROM meetings m
JOIN customers c ON m.customer_id = c.customer_id
CROSS JOIN LATERAL jsonb_array_elements(m.next_steps) as step
WHERE m.next_steps IS NOT NULL
  AND jsonb_typeof(m.next_steps) = 'array'
  AND jsonb_array_length(m.next_steps) > 1
  AND step->>'text' IS NOT NULL
  AND step->>'text' != ''
  -- Avoid duplicates
  AND NOT EXISTS (
    SELECT 1 FROM next_steps ns
    WHERE ns.source_type = 'meeting'
      AND ns.source_id = m.google_event_id
      AND ns.company_id = c.company_id
      AND ns.text = step->>'text'
  );

-- Show summary of what was inserted
SELECT 
  source_type,
  COUNT(*) as next_steps_count,
  COUNT(DISTINCT source_id) as unique_sources,
  COUNT(DISTINCT company_id) as unique_companies
FROM next_steps
WHERE source_type = 'meeting'
GROUP BY source_type;

