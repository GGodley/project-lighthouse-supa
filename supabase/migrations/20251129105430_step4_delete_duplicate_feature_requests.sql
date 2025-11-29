-- Step 3b: Delete duplicate feature_requests that would violate unique constraint
-- This handles the case where merging duplicate features would create duplicate (customer_id, feature_id) pairs
-- Run this BEFORE merging the features themselves

-- For each set of duplicate features, delete newer feature_requests that would conflict
-- Strategy: For each (customer_id, canonical_feature_id) pair, keep only the oldest request

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
),
all_requests_for_merge AS (
  -- Get all requests that will be merged (both canonical and duplicate features)
  SELECT 
    fr.id,
    fr.customer_id,
    fr.feature_id,
    fr.requested_at,
    COALESCE(cfm.canonical_id, fr.feature_id) as target_feature_id
  FROM public.feature_requests fr
  LEFT JOIN canonical_feature_map cfm ON fr.feature_id = ANY(cfm.duplicate_ids)
  WHERE fr.feature_id IN (
    SELECT canonical_id FROM canonical_feature_map
    UNION
    SELECT unnest(duplicate_ids) FROM canonical_feature_map
  )
),
ranked_requests AS (
  -- Rank requests by customer and target feature, keeping oldest first
  SELECT 
    id,
    customer_id,
    target_feature_id,
    requested_at,
    ROW_NUMBER() OVER (
      PARTITION BY customer_id, target_feature_id 
      ORDER BY requested_at ASC, id ASC
    ) as rn
  FROM all_requests_for_merge
)
DELETE FROM public.feature_requests
WHERE id IN (
  SELECT id FROM ranked_requests WHERE rn > 1
);

