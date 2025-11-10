-- Create function to calculate company health score from customer thread_messages
-- Company health score = average of all customer health scores for that company
-- OR calculate directly from thread_messages for all customers in the company

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
BEGIN
  -- Get count of messages with sentiment_score for all customers in this company
  SELECT COUNT(*)
  INTO v_total_messages
  FROM public.thread_messages tm
  JOIN public.customers c ON tm.customer_id = c.customer_id
  WHERE c.company_id = p_company_id
    AND tm.sentiment_score IS NOT NULL;
  
  -- If no analyzed messages, return 0 (neutral)
  IF v_total_messages = 0 THEN
    UPDATE public.companies
    SET health_score = 0
    WHERE company_id = p_company_id;
    RETURN 0;
  END IF;
  
  -- Sum all positive scores (1, 2) for all customers in this company
  SELECT COALESCE(SUM(CASE WHEN tm.sentiment_score IN (1, 2) THEN tm.sentiment_score ELSE 0 END), 0)
  INTO v_positive_sum
  FROM public.thread_messages tm
  JOIN public.customers c ON tm.customer_id = c.customer_id
  WHERE c.company_id = p_company_id
    AND tm.sentiment_score IS NOT NULL;
  
  -- Sum all negative scores (-1, -2) for all customers in this company
  SELECT COALESCE(SUM(CASE WHEN tm.sentiment_score IN (-1, -2) THEN ABS(tm.sentiment_score) ELSE 0 END), 0)
  INTO v_negative_sum
  FROM public.thread_messages tm
  JOIN public.customers c ON tm.customer_id = c.customer_id
  WHERE c.company_id = p_company_id
    AND tm.sentiment_score IS NOT NULL;
  
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
  
  -- Update company's health_score
  UPDATE public.companies
  SET health_score = v_health_score
  WHERE company_id = p_company_id;
  
  RETURN v_health_score;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.calculate_company_health_score(UUID) IS 'Calculates and updates company health score based on thread_messages sentiment scores from all customers in the company. Returns the calculated health score.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_company_health_score(UUID) TO authenticated, anon;

-- Update the trigger to also update company health scores when customer health scores change
CREATE OR REPLACE FUNCTION public.update_company_health_score_on_customer_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Determine which company_id to update
  IF TG_OP = 'DELETE' THEN
    v_company_id := OLD.company_id;
  ELSE
    v_company_id := NEW.company_id;
  END IF;
  
  -- Only update if company_id is not null and health_score changed (for UPDATE)
  IF v_company_id IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      -- Only trigger if health_score actually changed
      IF (OLD.health_score IS DISTINCT FROM NEW.health_score) OR
         (OLD.company_id IS DISTINCT FROM NEW.company_id) THEN
        PERFORM public.calculate_company_health_score(v_company_id);
        
        -- Also update old company if company_id changed
        IF OLD.company_id IS NOT NULL AND OLD.company_id IS DISTINCT FROM NEW.company_id THEN
          PERFORM public.calculate_company_health_score(OLD.company_id);
        END IF;
      END IF;
    ELSE
      -- For INSERT or DELETE, always recalculate
      PERFORM public.calculate_company_health_score(v_company_id);
    END IF;
  END IF;
  
  RETURN CASE
    WHEN TG_OP = 'DELETE' THEN OLD
    ELSE NEW
  END;
END;
$$;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS update_company_health_score_on_customer_change ON public.customers;

-- Create trigger on customers table to update company health scores
CREATE TRIGGER update_company_health_score_on_customer_change
  AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_company_health_score_on_customer_change();

-- Also update company health scores when thread_messages change (in addition to customer health scores)
-- Modify the existing trigger function to also update company health scores
CREATE OR REPLACE FUNCTION public.update_customer_health_score_on_thread_message_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
  v_company_id UUID;
BEGIN
  -- Determine which customer_id to update
  IF TG_OP = 'DELETE' THEN
    v_customer_id := OLD.customer_id;
  ELSE
    v_customer_id := NEW.customer_id;
  END IF;
  
  -- Only update if customer_id is not null and sentiment_score changed (for UPDATE)
  IF v_customer_id IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      -- Only trigger if sentiment_score actually changed
      IF (OLD.sentiment_score IS DISTINCT FROM NEW.sentiment_score) OR
         (OLD.customer_id IS DISTINCT FROM NEW.customer_id) THEN
        PERFORM public.calculate_customer_health_score(v_customer_id);
        
        -- Get company_id and update company health score
        SELECT company_id INTO v_company_id
        FROM public.customers
        WHERE customer_id = v_customer_id;
        
        IF v_company_id IS NOT NULL THEN
          PERFORM public.calculate_company_health_score(v_company_id);
        END IF;
        
        -- Also update old customer if customer_id changed
        IF OLD.customer_id IS NOT NULL AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
          PERFORM public.calculate_customer_health_score(OLD.customer_id);
          
          -- Update old customer's company
          SELECT company_id INTO v_company_id
          FROM public.customers
          WHERE customer_id = OLD.customer_id;
          
          IF v_company_id IS NOT NULL THEN
            PERFORM public.calculate_company_health_score(v_company_id);
          END IF;
        END IF;
      END IF;
    ELSE
      -- For INSERT or DELETE, always recalculate
      PERFORM public.calculate_customer_health_score(v_customer_id);
      
      -- Get company_id and update company health score
      SELECT company_id INTO v_company_id
      FROM public.customers
      WHERE customer_id = v_customer_id;
      
      IF v_company_id IS NOT NULL THEN
        PERFORM public.calculate_company_health_score(v_company_id);
      END IF;
    END IF;
  END IF;
  
  RETURN CASE
    WHEN TG_OP = 'DELETE' THEN OLD
    ELSE NEW
  END;
END;
$$;

