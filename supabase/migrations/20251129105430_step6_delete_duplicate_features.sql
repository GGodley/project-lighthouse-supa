-- Step 3d: Delete duplicate features (keep the oldest one)
-- Run this AFTER step 5 (merging feature_requests)

WITH duplicate_features AS (
  SELECT 
    id,
    LOWER(TRIM(title)) as normalized_title,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(title)) ORDER BY created_at ASC) as rn
  FROM public.features
)
DELETE FROM public.features
WHERE id IN (
  SELECT id FROM duplicate_features WHERE rn > 1
);

