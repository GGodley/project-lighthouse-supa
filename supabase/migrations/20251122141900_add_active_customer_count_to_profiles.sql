-- Add active_customer_count column to profiles table for O(1) lookups
-- This denormalized column stores the current count of active customers for each user
-- Updated automatically via triggers to ensure accuracy

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS active_customer_count INTEGER DEFAULT 0 NOT NULL;

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_active_customer_count ON public.profiles(active_customer_count);

-- Add comment
COMMENT ON COLUMN public.profiles.active_customer_count IS 'Denormalized count of active customers (excluding those from archived/deleted companies). Updated automatically via triggers.';

