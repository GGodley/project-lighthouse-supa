-- Create function to update company last_interaction_at based on threads
-- This function calculates the MAX(last_message_date) from all threads linked to a company

CREATE OR REPLACE FUNCTION public.update_company_last_interaction_at(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_interaction TIMESTAMPTZ;
BEGIN
  -- Get the most recent last_message_date from all threads linked to this company
  SELECT MAX(t.last_message_date)
  INTO v_last_interaction
  FROM public.threads t
  JOIN public.thread_company_link tcl ON t.thread_id = tcl.thread_id
  WHERE tcl.company_id = p_company_id
    AND t.last_message_date IS NOT NULL;

  -- Update the company's last_interaction_at
  UPDATE public.companies
  SET last_interaction_at = v_last_interaction
  WHERE company_id = p_company_id;
END;
$$;

-- Create trigger function for threads table
-- Updates last_interaction_at for all companies linked to a thread when last_message_date changes
CREATE OR REPLACE FUNCTION public.update_company_last_interaction_on_thread_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Only process if last_message_date changed (for UPDATE) or is set (for INSERT)
  IF TG_OP = 'UPDATE' THEN
    -- Only trigger if last_message_date actually changed
    IF OLD.last_message_date IS DISTINCT FROM NEW.last_message_date THEN
      -- Update all companies linked to this thread
      FOR v_company_id IN
        SELECT DISTINCT company_id
        FROM public.thread_company_link
        WHERE thread_id = NEW.thread_id
      LOOP
        PERFORM public.update_company_last_interaction_at(v_company_id);
      END LOOP;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- For new threads, update all linked companies if last_message_date is set
    IF NEW.last_message_date IS NOT NULL THEN
      FOR v_company_id IN
        SELECT DISTINCT company_id
        FROM public.thread_company_link
        WHERE thread_id = NEW.thread_id
      LOOP
        PERFORM public.update_company_last_interaction_at(v_company_id);
      END LOOP;
    END IF;
  END IF;

  RETURN CASE
    WHEN TG_OP = 'DELETE' THEN OLD
    ELSE NEW
  END;
END;
$$;

-- Create trigger on threads table
DROP TRIGGER IF EXISTS update_company_last_interaction_on_thread_change ON public.threads;
CREATE TRIGGER update_company_last_interaction_on_thread_change
  AFTER INSERT OR UPDATE OF last_message_date ON public.threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_company_last_interaction_on_thread_change();

-- Create trigger function for thread_company_link table
-- Updates last_interaction_at when links are created or deleted
CREATE OR REPLACE FUNCTION public.update_company_last_interaction_on_link_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New link created - update the company
    PERFORM public.update_company_last_interaction_at(NEW.company_id);
  ELSIF TG_OP = 'DELETE' THEN
    -- Link deleted - update the company (in case this was the most recent thread)
    PERFORM public.update_company_last_interaction_at(OLD.company_id);
  END IF;

  RETURN CASE
    WHEN TG_OP = 'DELETE' THEN OLD
    ELSE NEW
  END;
END;
$$;

-- Create trigger on thread_company_link table
DROP TRIGGER IF EXISTS update_company_last_interaction_on_link_change ON public.thread_company_link;
CREATE TRIGGER update_company_last_interaction_on_link_change
  AFTER INSERT OR DELETE ON public.thread_company_link
  FOR EACH ROW
  EXECUTE FUNCTION public.update_company_last_interaction_on_link_change();

-- Backfill: Update all existing companies with their last_interaction_at
-- This runs once to populate existing data
DO $$
DECLARE
  v_company RECORD;
BEGIN
  FOR v_company IN
    SELECT DISTINCT c.company_id
    FROM public.companies c
  LOOP
    PERFORM public.update_company_last_interaction_at(v_company.company_id);
  END LOOP;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.update_company_last_interaction_at(UUID) IS 'Updates the last_interaction_at field for a company based on the most recent thread message date';
COMMENT ON FUNCTION public.update_company_last_interaction_on_thread_change() IS 'Trigger function that updates company last_interaction_at when threads are inserted or updated';
COMMENT ON FUNCTION public.update_company_last_interaction_on_link_change() IS 'Trigger function that updates company last_interaction_at when thread-company links are created or deleted';

