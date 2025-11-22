-- Create triggers to automatically update active_customer_count when customers or companies change
-- This ensures the denormalized count is always accurate

-- Trigger function for customer changes
CREATE OR REPLACE FUNCTION public.update_customer_count_on_customer_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Determine user_id based on operation
  IF TG_OP = 'DELETE' THEN
    -- Get user_id from the company (if company still exists)
    SELECT co.user_id INTO v_user_id
    FROM public.companies co
    WHERE co.company_id = OLD.company_id;
    
    -- If company exists, recalculate count
    IF v_user_id IS NOT NULL THEN
      PERFORM public.recalculate_user_customer_count(v_user_id);
    END IF;
  ELSE
    -- For INSERT or UPDATE, get user_id from the company
    SELECT co.user_id INTO v_user_id
    FROM public.companies co
    WHERE co.company_id = NEW.company_id;
    
    -- If company exists, recalculate count
    IF v_user_id IS NOT NULL THEN
      PERFORM public.recalculate_user_customer_count(v_user_id);
    END IF;
  END IF;
  
  RETURN CASE
    WHEN TG_OP = 'DELETE' THEN OLD
    ELSE NEW
  END;
END;
$$;

-- Trigger function for company status changes
CREATE OR REPLACE FUNCTION public.update_customer_count_on_company_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only recalculate if status changed (archive/restore operations)
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
      -- Status changed (e.g., archived or restored)
      PERFORM public.recalculate_user_customer_count(NEW.user_id);
      
      -- If company was moved to different user (unlikely but handle it)
      IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
        PERFORM public.recalculate_user_customer_count(OLD.user_id);
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Company deleted - recalculate for the user
    PERFORM public.recalculate_user_customer_count(OLD.user_id);
  ELSIF TG_OP = 'INSERT' THEN
    -- New company - recalculate for the user
    PERFORM public.recalculate_user_customer_count(NEW.user_id);
  END IF;
  
  RETURN CASE
    WHEN TG_OP = 'DELETE' THEN OLD
    ELSE NEW
  END;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_customer_count_on_customer_change ON public.customers;
DROP TRIGGER IF EXISTS update_customer_count_on_company_change ON public.companies;

-- Create trigger on customers table
CREATE TRIGGER update_customer_count_on_customer_change
  AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_count_on_customer_change();

-- Create trigger on companies table (for status changes)
CREATE TRIGGER update_customer_count_on_company_change
  AFTER INSERT OR UPDATE OR DELETE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_count_on_company_change();

-- Add comments
COMMENT ON FUNCTION public.update_customer_count_on_customer_change() IS 'Automatically updates active_customer_count when customers are inserted, updated, or deleted';
COMMENT ON FUNCTION public.update_customer_count_on_company_change() IS 'Automatically updates active_customer_count when company status changes (archive/restore/delete)';

