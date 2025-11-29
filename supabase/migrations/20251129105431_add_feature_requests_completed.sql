-- Add completed column to feature_requests table

-- Step 1: Add completed column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'feature_requests' 
    AND column_name = 'completed'
  ) THEN
    ALTER TABLE public.feature_requests 
    ADD COLUMN completed BOOLEAN DEFAULT false NOT NULL;
  END IF;
END $$;

-- Step 2: Update existing records to set completed = false (safety measure)
UPDATE public.feature_requests
SET completed = false
WHERE completed IS NULL;

-- Step 3: Create index on completed for performance (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_feature_requests_completed ON public.feature_requests(completed);

-- Step 4: Create composite index for common queries (company_id, completed)
CREATE INDEX IF NOT EXISTS idx_feature_requests_company_completed ON public.feature_requests(company_id, completed);

