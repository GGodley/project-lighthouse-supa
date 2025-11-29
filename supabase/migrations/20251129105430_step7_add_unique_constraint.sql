-- Step 4: Add unique constraint on title
-- Run this AFTER all duplicate features have been merged and deleted

-- Check if constraint already exists before adding
DO $add_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'features' 
    AND constraint_name = 'features_title_key'
  ) THEN
    ALTER TABLE public.features
    ADD CONSTRAINT features_title_key UNIQUE (title);
  END IF;
END $add_constraint$;

