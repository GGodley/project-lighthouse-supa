-- Update get_company_page_details function to use threads instead of emails table
-- This ensures the interaction timeline shows threads (with full conversations) instead of individual emails

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
        -- Thread-based email interactions (new system - PRIMARY)
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
        
        -- Legacy emails interactions (old system - for backward compatibility only)
        -- Only show emails that are NOT already in threads
        SELECT 
          'email'::text as interaction_type,
          e.received_at as interaction_date,
          e.id::text as id,
          e.subject as title,
          COALESCE(e.summary, e.snippet) as summary,
          COALESCE(e.sentiment, 'Neutral') as sentiment
        FROM emails e
        JOIN customers c ON e.customer_id = c.customer_id
        WHERE c.company_id = company_id_param
          AND NOT EXISTS (
            -- Exclude if this email is already represented in threads
            SELECT 1 FROM thread_messages tm
            WHERE tm.message_id = e.id::text
          )
        
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
    'all_next_steps', (
      SELECT COALESCE(json_agg(DISTINCT step), '[]'::json)
      FROM (
        -- Next steps from threads (new system - PRIMARY)
        SELECT t.llm_summary->>'csm_next_step' as step
        FROM threads t
        JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
        WHERE tcl.company_id = company_id_param
          AND t.llm_summary IS NOT NULL
          AND t.llm_summary->>'csm_next_step' IS NOT NULL
          AND t.llm_summary->>'csm_next_step' != ''
        
        UNION
        
        -- Next steps from legacy emails (old system - for backward compatibility)
        SELECT unnest(e.next_steps) as step
        FROM emails e
        JOIN customers c ON e.customer_id = c.customer_id
        WHERE c.company_id = company_id_param
          AND e.next_steps IS NOT NULL
          AND array_length(e.next_steps, 1) > 0
          AND NOT EXISTS (
            -- Exclude if this email is already represented in threads
            SELECT 1 FROM thread_messages tm
            WHERE tm.message_id = e.id::text
          )
        
        UNION
        
        -- Next steps from meetings
        SELECT m.next_steps as step
        FROM meetings m
        JOIN customers c ON m.customer_id = c.customer_id
        WHERE c.company_id = company_id_param
          AND m.next_steps IS NOT NULL
          AND m.next_steps != ''
      ) all_steps
      WHERE step IS NOT NULL
        AND step != ''
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_company_page_details(uuid) TO authenticated;

