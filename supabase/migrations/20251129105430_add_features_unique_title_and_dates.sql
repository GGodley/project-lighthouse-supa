-- Add unique constraint on features.title and add first_requested/last_requested columns

-- Step 1: Add first_requested and last_requested columns if they don't exist
DO $$
BEGIN
  -- Add first_requested column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'features' 
    AND column_name = 'first_requested'
  ) THEN
    ALTER TABLE public.features 
    ADD COLUMN first_requested TIMESTAMPTZ;
  END IF;

  -- Add last_requested column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'features' 
    AND column_name = 'last_requested'
  ) THEN
    ALTER TABLE public.features 
    ADD COLUMN last_requested TIMESTAMPTZ;
  END IF;
END $$;

-- Step 2: Backfill first_requested and last_requested from feature_requests
-- For each feature, find the earliest and latest requested_at from feature_requests
UPDATE public.features f
SET 
  first_requested = (
    SELECT MIN(fr.requested_at)
    FROM public.feature_requests fr
    WHERE fr.feature_id = f.id
  ),
  last_requested = (
    SELECT MAX(fr.requested_at)
    FROM public.feature_requests fr
    WHERE fr.feature_id = f.id
  )
WHERE first_requested IS NULL OR last_requested IS NULL;

-- For features with no feature_requests, use created_at as fallback
UPDATE public.features
SET 
  first_requested = COALESCE(first_requested, created_at),
  last_requested = COALESCE(last_requested, created_at)
WHERE first_requested IS NULL OR last_requested IS NULL;

-- Step 3: Handle duplicate titles before adding unique constraint
-- First, merge duplicate features by updating feature_requests to point to the oldest feature
DO $$
DECLARE
  dup_record RECORD;
  oldest_id UUID;
BEGIN
  -- Find duplicate titles (case-insensitive for matching, but we'll keep exact case)
  FOR dup_record IN
    SELECT LOWER(TRIM(title)) as normalized_title, array_agg(id ORDER BY created_at ASC) as ids
    FROM public.features
    GROUP BY LOWER(TRIM(title))
    HAVING COUNT(*) > 1
  LOOP
    -- Get the oldest feature ID (first in the array)
    oldest_id := dup_record.ids[1];
    
    -- Update all feature_requests pointing to duplicate features to point to the oldest one
    UPDATE public.feature_requests
    SET feature_id = oldest_id
    WHERE feature_id = ANY(dup_record.ids[2:array_length(dup_record.ids, 1)]);
    
    -- Delete duplicate features (keep the oldest one)
    DELETE FROM public.features
    WHERE id = ANY(dup_record.ids[2:array_length(dup_record.ids, 1)]);
  END LOOP;
END $$;

-- Step 4: Add unique constraint on title (if it doesn't exist)
DO $$
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
END $$;

-- Step 5: Create index on title for performance (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_features_title ON public.features(title);

