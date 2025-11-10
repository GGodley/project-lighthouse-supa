-- Update get_company_page_details function to use next_steps table
CREATE OR REPLACE FUNCTION get_company_page_details(company_id_param uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'company_details', (
      SELECT to_json(c.*)
      FROM companies c
      WHERE c.company_id = company_id_param
    ),
    'product_feedback', (
      SELECT COALESCE(json_agg(fr.* ORDER BY fr.requested_at DESC), '[]'::json)
      FROM feature_requests fr
      WHERE fr.company_id = company_id_param
    ),
    'interaction_timeline', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'interaction_type', interaction_type,
          'interaction_date', interaction_date,
          'id', id,
          'title', title,
          'summary', summary,
          'sentiment', sentiment
        ) ORDER BY interaction_date DESC
      ), '[]'::json)
      FROM (
        -- Thread-based email interactions (new system)
        SELECT 
          'email'::text as interaction_type,
          t.last_message_date as interaction_date,
          t.thread_id as id,
          COALESCE(t.subject, 'No Subject') as title,
          COALESCE(
            t.llm_summary->>'problem_statement',
            t.llm_summary->>'timeline_summary',
            t.snippet,
            'No summary available.'
          ) as summary,
          COALESCE(t.llm_summary->>'customer_sentiment', 'Neutral') as sentiment
        FROM threads t
        JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
        WHERE tcl.company_id = company_id_param
          AND t.last_message_date IS NOT NULL
        
        UNION ALL
        
        -- Meetings interactions
        SELECT 
          'meeting'::text as interaction_type,
          m.start_time as interaction_date,
          m.google_event_id as id,
          m.title,
          m.summary,
          COALESCE(m.customer_sentiment, 'Neutral') as sentiment
        FROM meetings m
        JOIN customers c ON m.customer_id = c.customer_id
        WHERE c.company_id = company_id_param
      ) combined_interactions
    ),
    'next_steps', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', ns.id,
          'text', ns.text,
          'completed', ns.completed,
          'owner', ns.owner,
          'due_date', ns.due_date,
          'source_type', ns.source_type,
          'created_at', ns.created_at
        ) ORDER BY ns.completed ASC, ns.created_at DESC
      ), '[]'::json)
      FROM next_steps ns
      WHERE ns.company_id = company_id_param
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_company_page_details(uuid) TO authenticated;

