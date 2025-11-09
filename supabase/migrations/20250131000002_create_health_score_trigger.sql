-- Create trigger to automatically update customer health_score when thread_messages change

-- Create trigger function
CREATE OR REPLACE FUNCTION public.update_customer_health_score_on_thread_message_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
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
        
        -- Also update old customer if customer_id changed
        IF OLD.customer_id IS NOT NULL AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
          PERFORM public.calculate_customer_health_score(OLD.customer_id);
        END IF;
      END IF;
    ELSE
      -- For INSERT or DELETE, always recalculate
      PERFORM public.calculate_customer_health_score(v_customer_id);
    END IF;
  END IF;
  
  RETURN CASE
    WHEN TG_OP = 'DELETE' THEN OLD
    ELSE NEW
  END;
END;
$$;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS update_customer_health_score_on_thread_message_change ON public.thread_messages;

-- Create trigger
CREATE TRIGGER update_customer_health_score_on_thread_message_change
  AFTER INSERT OR UPDATE OR DELETE ON public.thread_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_health_score_on_thread_message_change();

-- Add comment
COMMENT ON FUNCTION public.update_customer_health_score_on_thread_message_change() IS 'Automatically updates customer health_score when thread_messages are inserted, updated, or deleted';

