-- Add threads_last_synced_at column to profiles table
-- This tracks when threads were last synced for each user
-- Uses TIMESTAMPTZ to store UTC time consistently

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS threads_last_synced_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.threads_last_synced_at IS 'UTC timestamp of when threads were last synced for this user. Used for incremental sync queries to Gmail API.';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_threads_last_synced_at 
ON public.profiles(threads_last_synced_at) 
WHERE threads_last_synced_at IS NOT NULL;

