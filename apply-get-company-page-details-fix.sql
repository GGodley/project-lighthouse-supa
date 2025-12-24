-- Fix get_company_page_details function to return status enum instead of completed boolean
-- This migration updates the function to:
-- - Return 'status' field with enum values ('todo', 'in_progress', 'done') instead of 'completed' boolean
-- - Fix the status comparison to use 'done' instead of 'completed'
-- - Use correct column names: step_id, description, thread_id, meeting_id
-- - Handle both thread-linked and meeting-linked next steps

DROP FUNCTION IF EXISTS get_company_page_details(uuid);

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
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', fr.feature_id,
            'title', fr.title,
            'description', fr.customer_description,
            'urgency', fr.urgency,
            'status', COALESCE(fr.status, 'open'),
            'source', 'email',
            'source_id', NULL,
            'source_type', 'email',
            'company_id', company_id_param,
            'created_at', fr.created_at,
            'updated_at', fr.created_at
          ) ORDER BY fr.created_at DESC
        ),
        '[]'::json
      )
      FROM feature_requests fr
      JOIN threads t ON fr.thread_id = t.thread_id
      JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
      WHERE tcl.company_id = company_id_param
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
        -- CRITICAL: Safe JSON parsing for llm_summary (JSONB column with potentially invalid JSON)
        -- Prioritizes timeline_summary over problem_statement
        SELECT 
          'email'::text as interaction_type,
          t.last_message_date as interaction_date,
          t.thread_id as id,
          COALESCE(t.subject, 'No Subject') as title,
          -- Safe extraction for Summary: Check timeline_summary first, then problem_statement
          CASE 
            WHEN t.llm_summary IS NOT NULL AND t.llm_summary::text ~ '^\s*\{.*\}\s*$' THEN 
              COALESCE((t.llm_summary)->>'timeline_summary', (t.llm_summary)->>'problem_statement', t.snippet, 'No summary available.')
            ELSE 
              -- If it's not JSON, return the raw text (if meaningful) or a fallback
              COALESCE(t.snippet, 'No summary available.')
          END as summary,
          -- Safe extraction for Sentiment
          CASE 
            WHEN t.llm_summary IS NOT NULL AND t.llm_summary::text ~ '^\s*\{.*\}\s*$' THEN 
              COALESCE((t.llm_summary)->>'customer_sentiment', 'Neutral')
            ELSE 'Neutral'
          END as sentiment
        FROM threads t
        JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
        WHERE tcl.company_id = company_id_param
          AND t.last_message_date IS NOT NULL
        
        UNION ALL
        
        -- Meetings interactions
        -- Only include meetings with summaries and start_time
        SELECT 
          'meeting'::text as interaction_type,
          m.start_time as interaction_date,
          m.google_event_id as id,
          m.title,
          CASE 
            WHEN m.summary IS NOT NULL AND m.summary::text ~ '^\s*\{.*\}\s*$' THEN 
              COALESCE((m.summary::jsonb)->>'timeline_summary', (m.summary::jsonb)->>'problem_statement', 'Meeting')
            ELSE 
              COALESCE(m.title, 'Meeting')
          END as summary,
          'Neutral' as sentiment
        FROM meetings m
        JOIN customers c ON m.customer_id = c.customer_id
        WHERE c.company_id = company_id_param
          AND m.start_time IS NOT NULL
      ) combined_interactions
    ),
    'next_steps', (
      -- Include next steps from threads and meetings linked to this company
      -- Fixed: Return 'status' enum value instead of 'completed' boolean
      -- Use correct column names: step_id, description, thread_id, meeting_id
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', ns.step_id,
          'text', ns.description,
          'status', ns.status::text,
          'owner', ns.owner,
          'due_date', ns.due_date,
          'source_type', CASE 
            WHEN ns.thread_id IS NOT NULL THEN 'thread'
            WHEN ns.meeting_id IS NOT NULL THEN 'meeting'
            ELSE NULL
          END,
          'source_id', CASE
            WHEN ns.thread_id IS NOT NULL THEN ns.thread_id
            WHEN ns.meeting_id IS NOT NULL THEN NULL
            -- Cannot reliably get google_event_id due to schema mismatch:
            -- meeting_id is UUID but meetings.id is BIGINT
            -- Will be NULL until schema is fixed (meeting_id should be BIGINT)
            ELSE NULL
          END,
          'created_at', ns.created_at
        ) ORDER BY 
          CASE ns.status
            WHEN 'todo' THEN 1
            WHEN 'in_progress' THEN 2
            WHEN 'done' THEN 3
            ELSE 4
          END,
          ns.created_at DESC
      ), '[]'::json)
      FROM next_steps ns
      WHERE (
        -- Link next_steps to company via thread_company_link (next_steps -> threads -> thread_company_link -> companies)
        (ns.thread_id IS NOT NULL AND EXISTS (
          SELECT 1 
          FROM thread_company_link tcl
          WHERE tcl.thread_id = ns.thread_id
            AND tcl.company_id = company_id_param
        ))
        OR
        -- Link next_steps to company via meetings -> customers -> companies
        -- Note: There's a schema mismatch - meeting_id is UUID but meetings.id is BIGINT
        -- We'll link by user_id and company, and include all meeting-linked next steps for this company
        -- This is a workaround until the schema is aligned (meeting_id should be BIGINT to match meetings.id)
        (ns.meeting_id IS NOT NULL AND ns.thread_id IS NULL AND EXISTS (
          SELECT 1
          FROM meetings m
          JOIN customers c ON m.customer_id = c.customer_id
          WHERE c.company_id = company_id_param
            AND m.user_id = ns.user_id
        ))
      )
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_company_page_details(uuid) TO authenticated;

