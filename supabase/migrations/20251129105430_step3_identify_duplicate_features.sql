-- Step 3a: Identify duplicate features (for review)
-- Run this first to see what duplicates exist before merging

SELECT 
  LOWER(TRIM(title)) as normalized_title,
  array_agg(id ORDER BY created_at ASC) as feature_ids,
  array_agg(title ORDER BY created_at ASC) as titles,
  array_agg(created_at ORDER BY created_at ASC) as created_dates,
  COUNT(*) as duplicate_count
FROM public.features
GROUP BY LOWER(TRIM(title))
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, normalized_title;

