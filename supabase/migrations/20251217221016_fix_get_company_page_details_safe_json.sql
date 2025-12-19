-- Fix get_company_page_details function with safe JSON parsing
-- This migration fixes the 22P02 error by safely handling invalid JSON in llm_summary TEXT column
-- Also fixes feature_requests ID reference (uses feature_id instead of non-existent id column)

-- Drop the existing function first to avoid return type conflicts
DROP FUNCTION IF EXISTS get_company_page_details(uuid);

-- Create the fixed function
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
            'title', f.title,
            'description', NULL,  -- FIXED: Column for request description doesn't exist in feature_requests table
            'urgency', fr.urgency,
            'status', COALESCE(fr.status, 'open'),
            'source', fr.source,
            'source_id', 
              CASE 
                WHEN fr.source = 'email' THEN fr.email_id::text
                WHEN fr.source = 'meeting' THEN fr.meeting_id::text
                WHEN fr.source = 'thread' THEN fr.thread_id
                ELSE NULL
              END,
            'source_type', fr.source,
            'company_id', fr.company_id,
            'created_at', fr.requested_at,
            'updated_at', COALESCE(fr.updated_at, fr.requested_at)
          ) ORDER BY fr.requested_at DESC
        ),
        '[]'::json
      )
      FROM feature_requests fr
      JOIN features f ON fr.feature_id = f.id
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
        -- FIXED: Safe JSON parsing for llm_summary (TEXT column with potentially invalid JSON)
        SELECT 
          'email'::text as interaction_type,
          t.last_message_date as interaction_date,
          t.thread_id as id,
          COALESCE(t.subject, 'No Subject') as title,
          -- Safe extraction for Summary
          CASE 
            WHEN t.llm_summary IS NOT NULL AND t.llm_summary ~ '^\s*\{.*\}\s*$' THEN 
              COALESCE((t.llm_summary::jsonb)->>'problem_statement', (t.llm_summary::jsonb)->>'timeline_summary', t.snippet, 'No summary available.')
            ELSE 
              -- If it's not JSON, return the raw text (if meaningful) or a fallback
              COALESCE(t.snippet, 'No summary available.')
          END as summary,
          -- Safe extraction for Sentiment
          CASE 
            WHEN t.llm_summary IS NOT NULL AND t.llm_summary ~ '^\s*\{.*\}\s*$' THEN 
              COALESCE((t.llm_summary::jsonb)->>'customer_sentiment', 'Neutral')
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
          m.summary,
          COALESCE(m.customer_sentiment, 'Neutral') as sentiment
        FROM meetings m
        JOIN customers c ON m.customer_id = c.customer_id
        WHERE c.company_id = company_id_param
          AND m.summary IS NOT NULL
          AND m.start_time IS NOT NULL
      ) combined_interactions
    ),
    'next_steps', (
      -- Include next steps from BOTH threads and meetings
      -- No filter on source_type, so both 'thread' and 'meeting' are included
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', ns.id,
          'text', ns.text,
          'completed', ns.completed,
          'owner', ns.owner,
          'due_date', ns.due_date,
          'source_type', ns.source_type,
          'source_id', ns.source_id,
          'created_at', ns.created_at
        ) ORDER BY ns.completed ASC, ns.created_at DESC
      ), '[]'::json)
      FROM next_steps ns
      WHERE ns.company_id = company_id_param
        -- Explicitly include both thread and meeting next steps
        AND ns.source_type IN ('thread', 'meeting')
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_company_page_details(uuid) TO authenticated;

