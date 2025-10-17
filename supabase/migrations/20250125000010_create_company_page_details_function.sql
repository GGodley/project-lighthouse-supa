-- Create function to get comprehensive company page details
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
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', fr.id,
          'title', fr.title,
          'description', fr.description,
          'urgency', fr.urgency,
          'status', fr.status,
          'created_at', fr.created_at,
          'updated_at', fr.updated_at
        )
      ), '[]'::json)
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
        -- Emails interactions
        SELECT 
          'email'::text as interaction_type,
          e.received_at as interaction_date,
          e.id::text as id,
          e.subject as title,
          e.snippet as summary,
          COALESCE(e.sentiment, 'Neutral') as sentiment
        FROM emails e
        JOIN customers c ON e.customer_id = c.customer_id
        WHERE c.company_id = company_id_param
        
        UNION ALL
        
        -- Meetings interactions
        SELECT 
          'meeting'::text as interaction_type,
          m.start_time as interaction_date,
          COALESCE(m.google_event_id, m.id::text) as id,
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
        -- Next steps from emails
        SELECT unnest(e.next_steps) as step
        FROM emails e
        JOIN customers c ON e.customer_id = c.customer_id
        WHERE c.company_id = company_id_param
          AND e.next_steps IS NOT NULL
          AND array_length(e.next_steps, 1) > 0
        
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
