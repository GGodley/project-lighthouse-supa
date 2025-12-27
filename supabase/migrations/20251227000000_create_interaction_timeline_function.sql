-- Create function to get unified interaction timeline for a company
-- Combines threads (conversations) and meetings into a single timeline

CREATE OR REPLACE FUNCTION get_interaction_timeline(company_id_param uuid)
RETURNS TABLE (
  id text,
  title text,
  summary text,
  timestamp timestamptz,
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
    t.last_analyzed_at as timestamp,
    'conversation'::text as type
  FROM threads t
  JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
  WHERE tcl.company_id = company_id_param
    AND t.last_analyzed_at IS NOT NULL
  
  UNION ALL
  
  -- Meetings
  SELECT 
    m.id::text as id,
    COALESCE(m.title, 'Meeting') as title,
    COALESCE(m.summary, 'No summary available.') as summary,
    m.start_time as timestamp,
    'meeting'::text as type
  FROM meetings m
  WHERE m.company_id = company_id_param
    AND m.start_time IS NOT NULL
  
  ORDER BY timestamp DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_interaction_timeline(uuid) TO authenticated;

