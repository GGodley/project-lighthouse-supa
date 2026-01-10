-- Create function to recalculate company health score
-- Health score = sum of sentiment_score from top 10 most recent threads + 
--                sum of sentiment_score from top 5 most recent meetings
-- Uses JSONB columns: threads.llm_summary and meetings.meeting_llm_summary

CREATE OR REPLACE FUNCTION recalculate_company_health_score(target_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  thread_score INT;
  meeting_score INT;
  total_score INT;
BEGIN
  -- 1. Calculate Thread Score (Top 10 most recent)
  -- We cast to numeric first to handle floats, then round, then cast to int.
  SELECT COALESCE(SUM(ROUND((t.llm_summary->>'sentiment_score')::NUMERIC)), 0)::INT
  INTO thread_score
  FROM (
    SELECT threads.llm_summary
    FROM threads
    JOIN thread_company_link tcl ON threads.thread_id = tcl.thread_id
    WHERE tcl.company_id = target_company_id
      AND threads.llm_summary->>'sentiment_score' IS NOT NULL
    ORDER BY threads.created_at DESC
    LIMIT 10
  ) t;

  -- 2. Calculate Meeting Score (Top 5 most recent)
  -- meeting_attendees.meeting_event_id references meetings.google_event_id
  SELECT COALESCE(SUM(ROUND((m.meeting_llm_summary->>'sentiment_score')::NUMERIC)), 0)::INT
  INTO meeting_score
  FROM (
    SELECT meetings.meeting_llm_summary
    FROM meetings
    JOIN meeting_attendees ma ON meetings.google_event_id = ma.meeting_event_id
    JOIN customers c ON ma.customer_id = c.customer_id
    WHERE c.company_id = target_company_id
      AND meetings.meeting_llm_summary->>'sentiment_score' IS NOT NULL
    ORDER BY meetings.start_time DESC
    LIMIT 5
  ) m;

  -- 3. Update Company
  total_score := thread_score + meeting_score;
  
  UPDATE companies
  SET health_score = total_score
  WHERE company_id = target_company_id;
END;
$$;

-- Add comment
COMMENT ON FUNCTION recalculate_company_health_score(UUID) IS 'Recalculates company health score by summing sentiment scores from top 10 most recent threads and top 5 most recent meetings. Handles NULL values and decimal sentiment scores safely.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION recalculate_company_health_score(UUID) TO authenticated, anon;

