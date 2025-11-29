-- Step 3c: Merge duplicate features by updating feature_requests to point to canonical feature
-- Run this AFTER step 4 (deleting conflicting feature_requests)

WITH duplicate_features AS (
  SELECT 
    LOWER(TRIM(title)) as normalized_title,
    array_agg(id ORDER BY created_at ASC) as ids
  FROM public.features
  GROUP BY LOWER(TRIM(title))
  HAVING COUNT(*) > 1
),
canonical_feature_map AS (
  SELECT 
    df.normalized_title,
    df.ids[1] as canonical_id,
    df.ids[2:array_length(df.ids, 1)] as duplicate_ids
  FROM duplicate_features df
)
UPDATE public.feature_requests fr
SET feature_id = cfm.canonical_id
FROM canonical_feature_map cfm
WHERE fr.feature_id = ANY(cfm.duplicate_ids);

