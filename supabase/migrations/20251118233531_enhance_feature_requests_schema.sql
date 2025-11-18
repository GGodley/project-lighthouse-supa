-- Enhance feature_requests table schema for future-proof implementation
-- This migration adds missing columns, foreign keys, indexes, and triggers

-- Step 1: Add 'thread' to feature_request_source enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'thread' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'feature_request_source')
  ) THEN
    ALTER TYPE feature_request_source ADD VALUE 'thread';
  END IF;
END $$;

-- Step 2: Add thread_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'feature_requests' 
    AND column_name = 'thread_id'
  ) THEN
    ALTER TABLE public.feature_requests 
    ADD COLUMN thread_id TEXT;
  END IF;
END $$;

-- Step 3: Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'feature_requests' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.feature_requests 
    ADD COLUMN status TEXT DEFAULT 'open' 
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'rejected'));
  END IF;
END $$;

-- Step 4: Add updated_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'feature_requests' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.feature_requests 
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Step 5: Add foreign key constraint for thread_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'feature_requests' 
    AND constraint_name = 'feature_requests_thread_id_fkey'
  ) THEN
    ALTER TABLE public.feature_requests
    ADD CONSTRAINT feature_requests_thread_id_fkey
    FOREIGN KEY (thread_id) 
    REFERENCES public.threads(thread_id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_feature_requests_thread_id 
ON public.feature_requests(thread_id);

CREATE INDEX IF NOT EXISTS idx_feature_requests_status 
ON public.feature_requests(status);

CREATE INDEX IF NOT EXISTS idx_feature_requests_company_status 
ON public.feature_requests(company_id, status);

-- Step 7: Create trigger function for updated_at auto-update
CREATE OR REPLACE FUNCTION update_feature_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_update_feature_requests_updated_at ON public.feature_requests;

CREATE TRIGGER trigger_update_feature_requests_updated_at
BEFORE UPDATE ON public.feature_requests
FOR EACH ROW
EXECUTE FUNCTION update_feature_requests_updated_at();

-- Step 9: Update existing rows to have updated_at = requested_at if updated_at is NULL
UPDATE public.feature_requests
SET updated_at = requested_at
WHERE updated_at IS NULL;

