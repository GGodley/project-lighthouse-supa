-- Backfill overall_sentiment for all companies based on 90-day sentiment sum
-- NOTE: This migration should run AFTER 20250131000009_add_neutral_to_company_sentiment_enum.sql
-- Optimized to use a single UPDATE query instead of looping

-- Recalculate overall_sentiment for all companies using a more efficient approach
UPDATE public.companies c
SET 
  health_score = COALESCE((
    SELECT ROUND(
      (COALESCE(SUM(CASE WHEN tm.sentiment_score IN (1, 2) THEN tm.sentiment_score ELSE 0 END), 0)::NUMERIC / 
       NULLIF(COUNT(*), 0)::NUMERIC) * 100.0 -
      (COALESCE(SUM(CASE WHEN tm.sentiment_score IN (-1, -2) THEN ABS(tm.sentiment_score) ELSE 0 END), 0)::NUMERIC / 
       NULLIF(COUNT(*), 0)::NUMERIC) * 100.0
    )::INTEGER
    FROM public.thread_messages tm
    JOIN public.customers cust ON tm.customer_id = cust.customer_id
    WHERE cust.company_id = c.company_id
      AND tm.sentiment_score IS NOT NULL
  ), 0),
  overall_sentiment = CASE
    WHEN COALESCE((
      SELECT SUM(tm.sentiment_score)
      FROM public.thread_messages tm
      JOIN public.customers cust ON tm.customer_id = cust.customer_id
      WHERE cust.company_id = c.company_id
        AND tm.sentiment_score IS NOT NULL
        AND tm.sent_date >= NOW() - INTERVAL '90 days'
    ), 0) > 0 THEN 'Healthy'
    WHEN COALESCE((
      SELECT SUM(tm.sentiment_score)
      FROM public.thread_messages tm
      JOIN public.customers cust ON tm.customer_id = cust.customer_id
      WHERE cust.company_id = c.company_id
        AND tm.sentiment_score IS NOT NULL
        AND tm.sent_date >= NOW() - INTERVAL '90 days'
    ), 0) < 0 THEN 'At Risk'
    ELSE 'Neutral'
  END
WHERE EXISTS (
  SELECT 1 
  FROM public.customers cust
  WHERE cust.company_id = c.company_id
);

