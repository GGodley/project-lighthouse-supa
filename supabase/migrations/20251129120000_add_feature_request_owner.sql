-- Add owner column to feature_requests table

-- Step 1: Add owner column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'feature_requests' 
    AND column_name = 'owner'
  ) THEN
    ALTER TABLE public.feature_requests 
    ADD COLUMN owner TEXT DEFAULT NULL;
  END IF;
END $$;

-- Step 2: Create index on owner for performance (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_feature_requests_owner ON public.feature_requests(owner);

