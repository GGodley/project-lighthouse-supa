-- Create function to record monthly customer count snapshot
-- This function reads the current active_customer_count from profiles table
-- and records it in monthly_customer_counts
-- If p_record_previous_month is true, records for previous month (for cron jobs on 1st)
-- Otherwise records for current month (for on-demand recording)

CREATE OR REPLACE FUNCTION public.record_monthly_customer_count(
  p_user_id UUID,
  p_record_previous_month BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count INTEGER;
  v_year INTEGER;
  v_month INTEGER;
  v_target_date DATE;
BEGIN
  -- Determine target date: previous month if p_record_previous_month is true, else current month
  IF p_record_previous_month THEN
    v_target_date := DATE_TRUNC('month', NOW()) - INTERVAL '1 month';
  ELSE
    v_target_date := DATE_TRUNC('month', NOW());
  END IF;
  
  v_year := EXTRACT(YEAR FROM v_target_date)::INTEGER;
  v_month := EXTRACT(MONTH FROM v_target_date)::INTEGER;
  
  -- Get current active customer count from profiles table (fast lookup)
  SELECT active_customer_count
  INTO v_current_count
  FROM public.profiles
  WHERE id = p_user_id;
  
  -- Default to 0 if profile doesn't exist or count is NULL
  v_current_count := COALESCE(v_current_count, 0);
  
  -- Insert or update monthly count (idempotent)
  INSERT INTO public.monthly_customer_counts (user_id, year, month, customer_count, recorded_at)
  VALUES (p_user_id, v_year, v_month, v_current_count, NOW())
  ON CONFLICT (user_id, year, month)
  DO UPDATE SET
    customer_count = EXCLUDED.customer_count,
    recorded_at = EXCLUDED.recorded_at;
  
  RETURN v_current_count;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.record_monthly_customer_count(UUID) IS 'Records the current active_customer_count as a monthly snapshot. Idempotent - can be called multiple times in the same month.';

