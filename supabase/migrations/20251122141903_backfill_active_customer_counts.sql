-- Backfill active_customer_count for all existing users
-- This migration calculates the initial count for all users who already have customers

-- Update all profiles with their current active customer count
UPDATE public.profiles p
SET active_customer_count = COALESCE((
  SELECT COUNT(*)
  FROM public.customers c
  INNER JOIN public.companies co ON c.company_id = co.company_id
  WHERE co.user_id = p.id
    AND (co.status IS NULL OR co.status != 'archived')
), 0);

-- Add comment
COMMENT ON COLUMN public.profiles.active_customer_count IS 'Denormalized count of active customers. Backfilled for existing users on 2025-11-22.';

