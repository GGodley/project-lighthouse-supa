-- Verification Queries: Run these after applying the migration to verify it worked
-- Run in Supabase Dashboard SQL Editor: https://supabase.com/dashboard/project/fdaqphksmlmupyrsatcz/sql/new

-- ============================================================================
-- STEP 1: First, verify the columns were created
-- ============================================================================
-- Run this FIRST to confirm the migration was applied
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'meetings' 
  AND column_name IN ('meeting_type', 'meeting_url')
ORDER BY column_name;

-- Expected result: Should show 2 rows:
-- - meeting_type: text, nullable, no default
-- - meeting_url: text, nullable, no default
-- 
-- If this returns 0 rows, the migration hasn't been applied yet!
-- Go back and run apply-meeting-type-migration.sql first.

-- ============================================================================
-- STEP 2: Verify CHECK constraint exists on meeting_type
-- ============================================================================
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.meetings'::regclass
  AND conname LIKE '%meeting_type%';

-- Expected result: Should show a CHECK constraint allowing 'google_meet', 'zoom', or NULL

-- ============================================================================
-- STEP 3: Verify index exists
-- ============================================================================
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'meetings'
  AND indexname = 'idx_meetings_meeting_type';

-- Expected result: Should show idx_meetings_meeting_type index

-- ============================================================================
-- STEP 4: Check backfill results (only run if columns exist from Step 1)
-- ============================================================================
-- This query will only work if the columns exist
SELECT 
    COUNT(*) AS total_meetings,
    COUNT(meeting_url) AS meetings_with_url,
    COUNT(meeting_type) AS meetings_with_type,
    COUNT(CASE WHEN meeting_type = 'google_meet' THEN 1 END) AS google_meet_count,
    COUNT(CASE WHEN meeting_type = 'zoom' THEN 1 END) AS zoom_count,
    COUNT(CASE WHEN meeting_type IS NULL THEN 1 END) AS null_type_count
FROM meetings;

-- Expected result: Should show statistics about meetings with URLs and types

-- ============================================================================
-- STEP 5: Verify existing meetings have meeting_url populated from hangout_link
-- ============================================================================
-- This query will only work if the columns exist
SELECT 
    COUNT(*) AS meetings_with_hangout_link,
    COUNT(CASE WHEN meeting_url = hangout_link THEN 1 END) AS correctly_backfilled,
    COUNT(CASE WHEN meeting_url IS NULL AND hangout_link IS NOT NULL THEN 1 END) AS missing_backfill
FROM meetings
WHERE hangout_link IS NOT NULL;

-- Expected result: 
-- - meetings_with_hangout_link: number of meetings with hangout_link
-- - correctly_backfilled: should equal meetings_with_hangout_link
-- - missing_backfill: should be 0

-- ============================================================================
-- STEP 6: Sample data check (view a few meetings to see the new columns)
-- ============================================================================
-- This query will only work if the columns exist
SELECT 
    google_event_id,
    title,
    hangout_link,
    meeting_url,
    meeting_type,
    status
FROM meetings
ORDER BY created_at DESC
LIMIT 10;

-- Expected result: Should show meetings with meeting_url and meeting_type populated
-- - Google Meet meetings should have meeting_type = 'google_meet' and meeting_url = hangout_link
-- - Meetings without links will have NULL values

-- ============================================================================
-- QUICK VERIFICATION (Run this single query to check everything at once)
-- ============================================================================
-- Only run this AFTER Step 1 confirms columns exist
SELECT 
    'Columns exist' AS check_type,
    CASE 
        WHEN (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_name = 'meetings' 
              AND column_name IN ('meeting_type', 'meeting_url')) = 2 
        THEN 'PASS' 
        ELSE 'FAIL - Run migration first!' 
    END AS result

UNION ALL

SELECT 
    'Index exists' AS check_type,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'meetings' 
            AND indexname = 'idx_meetings_meeting_type'
        )
        THEN 'PASS' 
        ELSE 'FAIL' 
    END AS result

UNION ALL

SELECT 
    'Backfill complete' AS check_type,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 FROM meetings
            WHERE hangout_link IS NOT NULL 
            AND (meeting_url IS NULL OR meeting_type IS NULL)
        )
        THEN 'PASS' 
        ELSE 'FAIL - Some meetings not backfilled' 
    END AS result;
