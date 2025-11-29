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

