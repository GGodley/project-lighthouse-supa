-- Step 5: Create index on title for performance
-- This is safe to run multiple times

CREATE INDEX IF NOT EXISTS idx_features_title ON public.features(title);

