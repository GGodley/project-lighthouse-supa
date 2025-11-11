-- Update calculate_company_health_score to also calculate overall_sentiment
-- overall_sentiment is based on sum of sentiment scores from last 90 days:
-- Sum > 0: "Healthy", Sum = 0: "Neutral", Sum < 0: "At Risk"

CREATE OR REPLACE FUNCTION public.calculate_company_health_score(p_company_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_messages INTEGER;
  v_positive_sum INTEGER := 0;
  v_negative_sum INTEGER := 0;
  v_positive_percent NUMERIC;
  v_negative_percent NUMERIC;
  v_health_score INTEGER;
  v_sentiment_sum INTEGER := 0;
  v_overall_sentiment TEXT;
  v_ninety_days_ago TIMESTAMP;
BEGIN
  -- Calculate 90 days ago timestamp
  v_ninety_days_ago := NOW() - INTERVAL '90 days';
  
  -- Get count of messages with sentiment_score for all customers in this company (last 90 days)
  SELECT COUNT(*)
  INTO v_total_messages
  FROM public.thread_messages tm
  JOIN public.customers c ON tm.customer_id = c.customer_id
  WHERE c.company_id = p_company_id
    AND tm.sentiment_score IS NOT NULL
    AND tm.sent_date >= v_ninety_days_ago;
  
  -- Calculate overall_sentiment: sum all sentiment scores from last 90 days
  SELECT COALESCE(SUM(tm.sentiment_score), 0)
  INTO v_sentiment_sum
  FROM public.thread_messages tm
  JOIN public.customers c ON tm.customer_id = c.customer_id
  WHERE c.company_id = p_company_id
    AND tm.sentiment_score IS NOT NULL
    AND tm.sent_date >= v_ninety_days_ago;
  
  -- Determine overall_sentiment based on sum
  IF v_sentiment_sum > 0 THEN
    v_overall_sentiment := 'Healthy';
  ELSIF v_sentiment_sum = 0 THEN
    v_overall_sentiment := 'Neutral';
  ELSE
    v_overall_sentiment := 'At Risk';
  END IF;
  
  -- If no analyzed messages in last 90 days, set to Neutral
  IF v_total_messages = 0 THEN
    UPDATE public.companies
    SET health_score = 0,
        overall_sentiment = 'Neutral'
    WHERE company_id = p_company_id;
    RETURN 0;
  END IF;
  
  -- Sum all positive scores (1, 2) for all customers in this company (all time for health_score)
  SELECT COALESCE(SUM(CASE WHEN tm.sentiment_score IN (1, 2) THEN tm.sentiment_score ELSE 0 END), 0)
  INTO v_positive_sum
  FROM public.thread_messages tm
  JOIN public.customers c ON tm.customer_id = c.customer_id
  WHERE c.company_id = p_company_id
    AND tm.sentiment_score IS NOT NULL;
  
  -- Sum all negative scores (-1, -2) for all customers in this company (all time for health_score)
  SELECT COALESCE(SUM(CASE WHEN tm.sentiment_score IN (-1, -2) THEN ABS(tm.sentiment_score) ELSE 0 END), 0)
  INTO v_negative_sum
  FROM public.thread_messages tm
  JOIN public.customers c ON tm.customer_id = c.customer_id
  WHERE c.company_id = p_company_id
    AND tm.sentiment_score IS NOT NULL;
  
  -- Get total messages count for health_score calculation (all time)
  SELECT COUNT(*)
  INTO v_total_messages
  FROM public.thread_messages tm
  JOIN public.customers c ON tm.customer_id = c.customer_id
  WHERE c.company_id = p_company_id
    AND tm.sentiment_score IS NOT NULL;
  
  -- Calculate percentages: sum of scores / total messages (all time)
  IF v_total_messages > 0 THEN
    v_positive_percent := (v_positive_sum::NUMERIC / v_total_messages::NUMERIC) * 100.0;
    v_negative_percent := (v_negative_sum::NUMERIC / v_total_messages::NUMERIC) * 100.0;
  ELSE
    v_positive_percent := 0;
    v_negative_percent := 0;
  END IF;
  
  -- Calculate health score: positive % - negative % (all time)
  v_health_score := ROUND(v_positive_percent - v_negative_percent)::INTEGER;
  
  -- Clamp to -100 to 100 range
  IF v_health_score > 100 THEN
    v_health_score := 100;
  ELSIF v_health_score < -100 THEN
    v_health_score := -100;
  END IF;
  
  -- Update company's health_score and overall_sentiment
  UPDATE public.companies
  SET health_score = v_health_score,
      overall_sentiment = v_overall_sentiment
  WHERE company_id = p_company_id;
  
  RETURN v_health_score;
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.calculate_company_health_score(UUID) IS 'Calculates and updates company health score (all time) and overall_sentiment (last 90 days) based on thread_messages sentiment scores from all customers in the company. Returns the calculated health score.';

