-- Create function to calculate customer health score from thread_messages
-- Health score = (positive % - negative %) * 100, where:
-- positive % = sum of positive scores (1, 2) / total messages
-- negative % = sum of negative scores (-1, -2) / total messages

CREATE OR REPLACE FUNCTION public.calculate_customer_health_score(p_customer_id UUID)
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
BEGIN
  -- Get count of messages with sentiment_score (only analyzed messages)
  SELECT COUNT(*)
  INTO v_total_messages
  FROM public.thread_messages
  WHERE customer_id = p_customer_id
    AND sentiment_score IS NOT NULL;
  
  -- If no analyzed messages, return 0 (neutral)
  IF v_total_messages = 0 THEN
    RETURN 0;
  END IF;
  
  -- Sum all positive scores (1, 2) - add up all positive scores
  SELECT COALESCE(SUM(CASE WHEN sentiment_score IN (1, 2) THEN sentiment_score ELSE 0 END), 0)
  INTO v_positive_sum
  FROM public.thread_messages
  WHERE customer_id = p_customer_id
    AND sentiment_score IS NOT NULL;
  
  -- Sum all negative scores (-1, -2) - add up all negative scores (using absolute values for sum)
  SELECT COALESCE(SUM(CASE WHEN sentiment_score IN (-1, -2) THEN ABS(sentiment_score) ELSE 0 END), 0)
  INTO v_negative_sum
  FROM public.thread_messages
  WHERE customer_id = p_customer_id
    AND sentiment_score IS NOT NULL;
  
  -- Calculate percentages: sum of scores / total messages
  v_positive_percent := (v_positive_sum::NUMERIC / v_total_messages::NUMERIC) * 100.0;
  v_negative_percent := (v_negative_sum::NUMERIC / v_total_messages::NUMERIC) * 100.0;
  
  -- Calculate health score: positive % - negative %
  v_health_score := ROUND(v_positive_percent - v_negative_percent)::INTEGER;
  
  -- Clamp to -100 to 100 range
  IF v_health_score > 100 THEN
    v_health_score := 100;
  ELSIF v_health_score < -100 THEN
    v_health_score := -100;
  END IF;
  
  -- Update customer's health_score
  UPDATE public.customers
  SET health_score = v_health_score
  WHERE customer_id = p_customer_id;
  
  RETURN v_health_score;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.calculate_customer_health_score(UUID) IS 'Calculates and updates customer health score based on thread_messages sentiment scores. Returns the calculated health score.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_customer_health_score(UUID) TO authenticated, anon;

