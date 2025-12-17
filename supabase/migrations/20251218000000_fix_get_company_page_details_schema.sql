-- Fix get_company_page_details function to match actual feature_requests schema
-- This migration updates the function to use the correct column names:
-- - feature_id (primary key, not id)
-- - title (in feature_requests, not from features join)
-- - customer_description (not request_details)
-- - created_at (not requested_at)
-- - Removes references to non-existent columns (company_id, source, email_id, meeting_id, updated_at)
-- - Fixes next_steps to use step_id as primary key and description as the text column
-- - Fixes JSONB regex check by casting to text first (t.llm_summary::text ~ ...)
-- - Prioritizes timeline_summary over problem_statement for summary extraction
-- - Preserves safe JSON parsing for llm_summary

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
      -- Include next steps from BOTH threads and meetings
      -- Fixed: Use step_id as primary key and description as the text column
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', ns.step_id,
          'text', ns.description,
          'completed', ns.status = 'completed',
          'owner', ns.owner,
          'due_date', ns.due_date,
          'created_at', ns.created_at
        ) ORDER BY ns.status, ns.created_at DESC
      ), '[]'::json)
      FROM next_steps ns
      -- Linking next_steps to company via user_id
      WHERE ns.user_id IN (SELECT user_id FROM companies WHERE company_id = company_id_param)
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_company_page_details(uuid) TO authenticated;
