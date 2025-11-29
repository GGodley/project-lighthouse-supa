-- Step 1: Add first_requested and last_requested columns to features table
-- This is safe to run multiple times

ALTER TABLE public.features 
ADD COLUMN IF NOT EXISTS first_requested TIMESTAMPTZ;

ALTER TABLE public.features 
ADD COLUMN IF NOT EXISTS last_requested TIMESTAMPTZ;

