-- Cleanup script to identify and remove duplicate feature_requests records
-- This script identifies duplicates based on: company_id, feature_id, source, and source_id
-- It keeps the oldest record (earliest requested_at) and deletes the rest

-- Step 1: Identify duplicate feature_requests
-- Duplicates are defined as records with the same:
--   - company_id
--   - feature_id
--   - source
--   - source_id (email_id, meeting_id, or thread_id depending on source)

WITH ranked_requests AS (
  SELECT 
    id,
    company_id,
    feature_id,
    source,
    COALESCE(email_id::text, meeting_id::text, thread_id) as source_id,
    requested_at,
    ROW_NUMBER() OVER (
      PARTITION BY 
        company_id, 
        feature_id, 
        source,
        COALESCE(email_id::text, meeting_id::text, thread_id)
      ORDER BY requested_at ASC
    ) as rn
  FROM public.feature_requests
)
SELECT 
  id,
  company_id,
  feature_id,
  source,
  source_id,
  requested_at,
  rn
FROM ranked_requests
WHERE rn > 1
ORDER BY company_id, feature_id, source, source_id, requested_at;

-- Step 2: Delete duplicate records (keep the oldest one)
-- UNCOMMENT THE FOLLOWING TO ACTUALLY DELETE:
/*
WITH ranked_requests AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY 
        company_id, 
        feature_id, 
        source,
        COALESCE(email_id::text, meeting_id::text, thread_id)
      ORDER BY requested_at ASC
    ) as rn
  FROM public.feature_requests
)
DELETE FROM public.feature_requests
WHERE id IN (
  SELECT id FROM ranked_requests WHERE rn > 1
);
*/

-- Step 3: Optional - Merge feature_requests that point to duplicate features
-- This should be run AFTER the features table cleanup migration
-- This finds feature_requests pointing to duplicate features and updates them to point to the canonical feature
/*
WITH canonical_features AS (
  SELECT 
    id,
    title,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(title)) ORDER BY created_at ASC) as rn
  FROM public.features
),
duplicate_features AS (
  SELECT id, title
  FROM canonical_features
  WHERE rn > 1
),
canonical_feature_map AS (
  SELECT 
    df.id as duplicate_id,
    cf.id as canonical_id
  FROM duplicate_features df
  JOIN canonical_features cf ON LOWER(TRIM(df.title)) = LOWER(TRIM(cf.title)) AND cf.rn = 1
)
UPDATE public.feature_requests fr
SET feature_id = cfm.canonical_id
FROM canonical_feature_map cfm
WHERE fr.feature_id = cfm.duplicate_id;
*/

