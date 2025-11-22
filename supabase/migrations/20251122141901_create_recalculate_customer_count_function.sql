-- Create function to recalculate customer count for a user
-- This function counts customers where:
-- 1. Customer's company belongs to the user
-- 2. Company status is NOT 'archived'
-- 3. Company exists (not deleted)

CREATE OR REPLACE FUNCTION public.recalculate_user_customer_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count active customers for this user
  -- Active customers = customers whose company belongs to user AND company is not archived
  SELECT COUNT(*)
  INTO v_count
  FROM public.customers c
  INNER JOIN public.companies co ON c.company_id = co.company_id
  WHERE co.user_id = p_user_id
    AND (co.status IS NULL OR co.status != 'archived');
  
  -- Update the denormalized count in profiles table
  UPDATE public.profiles
  SET active_customer_count = v_count
  WHERE id = p_user_id;
  
  RETURN v_count;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.recalculate_user_customer_count(UUID) IS 'Recalculates and updates the active_customer_count for a user. Counts customers from non-archived companies.';

