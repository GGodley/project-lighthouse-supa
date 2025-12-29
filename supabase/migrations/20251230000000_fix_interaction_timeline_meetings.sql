-- Fix get_interaction_timeline function to include meetings via meeting_attendees
-- This ensures meetings appear in the interaction timeline even if they don't have
-- a direct company_id link, as long as any attendee belongs to the company

CREATE OR REPLACE FUNCTION get_interaction_timeline(company_id_param uuid)
RETURNS TABLE (
  id text,
  title text,
  summary text,
  interaction_timestamp timestamptz,
  type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Threads (conversations)
  SELECT 
    t.thread_id::text as id,
    COALESCE(t.subject, 'No Subject') as title,
    COALESCE(t.summary, t.snippet, 'No summary available.') as summary,
    t.last_analyzed_at as interaction_timestamp,
    'conversation'::text as type
  FROM threads t
  JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
  WHERE tcl.company_id = company_id_param
    AND t.last_analyzed_at IS NOT NULL
  
  UNION ALL
  
  -- Meetings
  -- Use DISTINCT to avoid duplicates if a meeting matches multiple conditions
  SELECT DISTINCT
    m.google_event_id as id,  -- Use google_event_id (PRIMARY KEY) to match old behavior
    COALESCE(m.title, 'Meeting') as title,
    -- Handle JSONB summary extraction like old function
    CASE 
      WHEN m.summary IS NOT NULL AND m.summary::text ~ '^\s*\{.*\}\s*$' THEN 
        COALESCE((m.summary::jsonb)->>'timeline_summary', (m.summary::jsonb)->>'problem_statement', m.summary::text, 'No summary available.')
      ELSE 
        COALESCE(m.summary::text, 'No summary available.')
    END as summary,
    m.start_time as interaction_timestamp,
    'meeting'::text as type
  FROM meetings m
  WHERE m.start_time IS NOT NULL
    AND m.summary IS NOT NULL  -- Only include meetings with summaries (matching old behavior)
    AND (
      -- Method 1: Direct company_id link on meeting
      m.company_id = company_id_param
      OR
      -- Method 2: Through customer_id -> customers -> company_id
      (m.customer_id IS NOT NULL AND EXISTS (
        SELECT 1 
        FROM customers c 
        WHERE c.customer_id = m.customer_id 
          AND c.company_id = company_id_param
      ))
      OR
      -- Method 3: Through meeting_attendees table (any attendee belongs to company)
      EXISTS (
        SELECT 1 
        FROM meeting_attendees ma
        WHERE ma.meeting_event_id = m.google_event_id
          AND ma.company_id = company_id_param
      )
    )
  
  ORDER BY interaction_timestamp DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_interaction_timeline(uuid) TO authenticated;

