-- Verification script to confirm migrations were applied successfully
-- Run this after completing all migration steps

-- 1. Verify columns were added
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'features'
  AND column_name IN ('first_requested', 'last_requested')
ORDER BY column_name;

-- Expected: Should return 2 rows with first_requested and last_requested

-- 2. Verify dates were backfilled
SELECT 
  COUNT(*) as total_features,
  COUNT(first_requested) as features_with_first_requested,
  COUNT(last_requested) as features_with_last_requested,
  COUNT(CASE WHEN first_requested IS NULL THEN 1 END) as missing_first_requested,
  COUNT(CASE WHEN last_requested IS NULL THEN 1 END) as missing_last_requested
FROM public.features;

-- Expected: All features should have both dates populated

-- 3. Verify no duplicate titles exist
SELECT 
  LOWER(TRIM(title)) as normalized_title,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as feature_ids,
  array_agg(title ORDER BY created_at) as titles
FROM public.features
GROUP BY LOWER(TRIM(title))
HAVING COUNT(*) > 1;

-- Expected: Should return 0 rows (no duplicates)

-- 4. Verify unique constraint exists
SELECT 
  constraint_name,
  constraint_type,
  table_name
FROM information_schema.table_constraints
WHERE constraint_schema = 'public'
  AND table_name = 'features'
  AND constraint_name = 'features_title_key';

-- Expected: Should return 1 row with constraint_name = 'features_title_key'

-- 5. Verify index exists
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'features'
  AND indexname = 'idx_features_title';

-- Expected: Should return 1 row with indexname = 'idx_features_title'

-- 6. Verify feature_requests completed column exists
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'feature_requests'
  AND column_name = 'completed';

-- Expected: Should return 1 row with completed column

-- 7. Check for any feature_requests pointing to non-existent features
SELECT 
  fr.id,
  fr.feature_id,
  fr.company_id,
  fr.customer_id
FROM public.feature_requests fr
LEFT JOIN public.features f ON fr.feature_id = f.id
WHERE f.id IS NULL;

-- Expected: Should return 0 rows (all feature_requests should point to valid features)

-- 8. Summary statistics
SELECT 
  'Features' as table_name,
  COUNT(*) as total_count,
  COUNT(DISTINCT LOWER(TRIM(title))) as unique_titles,
  COUNT(*) - COUNT(DISTINCT LOWER(TRIM(title))) as duplicate_count
FROM public.features
UNION ALL
SELECT 
  'Feature Requests' as table_name,
  COUNT(*) as total_count,
  COUNT(DISTINCT customer_id || '|' || feature_id) as unique_customer_feature_pairs,
  COUNT(*) - COUNT(DISTINCT customer_id || '|' || feature_id) as duplicate_count
FROM public.feature_requests;

-- Expected: duplicate_count should be 0 for both tables

