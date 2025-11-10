-- Migration script to migrate existing next steps from threads and meetings to next_steps table

-- Migrate next steps from threads
INSERT INTO public.next_steps (company_id, text, completed, owner, due_date, source_type, source_id, user_id, created_at)
SELECT DISTINCT
  tcl.company_id,
  COALESCE(
    (t.llm_summary->>'csm_next_step'),
    (t.llm_summary->'next_steps'->0->>'text')
  ) as text,
  false as completed,
  CASE 
    WHEN t.llm_summary->'next_steps'->0->>'owner' IS NOT NULL 
    THEN t.llm_summary->'next_steps'->0->>'owner'
    ELSE NULL
  END as owner,
  CASE 
    WHEN t.llm_summary->'next_steps'->0->>'due_date' IS NOT NULL 
    THEN (t.llm_summary->'next_steps'->0->>'due_date')::timestamptz
    ELSE NULL
  END as due_date,
  'thread' as source_type,
  t.thread_id as source_id,
  t.user_id,
  COALESCE(t.llm_summary_updated_at, t.created_at) as created_at
FROM threads t
JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
WHERE t.llm_summary IS NOT NULL
  AND (
    (t.llm_summary->>'csm_next_step' IS NOT NULL AND t.llm_summary->>'csm_next_step' != '')
    OR (t.llm_summary->'next_steps' IS NOT NULL AND jsonb_array_length(t.llm_summary->'next_steps') > 0)
  )
  -- Avoid duplicates
  AND NOT EXISTS (
    SELECT 1 FROM next_steps ns
    WHERE ns.source_type = 'thread'
      AND ns.source_id = t.thread_id
      AND ns.company_id = tcl.company_id
      AND ns.text = COALESCE(
        (t.llm_summary->>'csm_next_step'),
        (t.llm_summary->'next_steps'->0->>'text')
      )
  );

-- Migrate next steps from meetings (handle both old string format and new JSONB format)
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
  -- Avoid duplicates
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

-- For threads with multiple next steps in the new format, insert each one
INSERT INTO public.next_steps (company_id, text, completed, owner, due_date, source_type, source_id, user_id, created_at)
SELECT DISTINCT
  tcl.company_id,
  step->>'text' as text,
  false as completed,
  step->>'owner' as owner,
  CASE 
    WHEN step->>'due_date' IS NOT NULL 
    THEN (step->>'due_date')::timestamptz
    ELSE NULL
  END as due_date,
  'thread' as source_type,
  t.thread_id as source_id,
  t.user_id,
  COALESCE(t.llm_summary_updated_at, t.created_at) as created_at
FROM threads t
JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
CROSS JOIN LATERAL jsonb_array_elements(t.llm_summary->'next_steps') as step
WHERE t.llm_summary IS NOT NULL
  AND t.llm_summary->'next_steps' IS NOT NULL
  AND jsonb_typeof(t.llm_summary->'next_steps') = 'array'
  AND jsonb_array_length(t.llm_summary->'next_steps') > 1
  AND step->>'text' IS NOT NULL
  AND step->>'text' != ''
  -- Avoid duplicates
  AND NOT EXISTS (
    SELECT 1 FROM next_steps ns
    WHERE ns.source_type = 'thread'
      AND ns.source_id = t.thread_id
      AND ns.company_id = tcl.company_id
      AND ns.text = step->>'text'
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

