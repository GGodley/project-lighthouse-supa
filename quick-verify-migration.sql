-- Quick Verification: Check if migration was applied successfully
-- Run this in Supabase Dashboard SQL Editor after applying the migration

-- ============================================================================
-- COMPREHENSIVE VERIFICATION
-- ============================================================================

-- 1. Check if columns exist
SELECT 
    '✅ Columns Check' AS verification_step,
    CASE 
        WHEN (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_schema = 'public' 
                AND table_name = 'meetings' 
                AND column_name IN ('meeting_type', 'meeting_url')) = 2 
        THEN 'PASS - Both columns exist'
        ELSE 'FAIL - Columns missing'
    END AS result;

-- 2. Check column details
SELECT 
    'Column Details' AS verification_step,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'meetings' 
  AND column_name IN ('meeting_type', 'meeting_url')
ORDER BY column_name;

-- 3. Check if index exists
SELECT 
    '✅ Index Check' AS verification_step,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public' 
              AND tablename = 'meetings'
              AND indexname = 'idx_meetings_meeting_type'
        )
        THEN 'PASS - Index exists'
        ELSE 'FAIL - Index missing'
    END AS result;

-- 4. Check CHECK constraint
SELECT 
    '✅ Constraint Check' AS verification_step,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.meetings'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%meeting_type%'
        )
        THEN 'PASS - Constraint exists'
        ELSE 'FAIL - Constraint missing'
    END AS result;

-- 5. Check backfill results
SELECT 
    '✅ Backfill Check' AS verification_step,
    COUNT(*) AS total_meetings,
    COUNT(meeting_url) AS meetings_with_url,
    COUNT(meeting_type) AS meetings_with_type,
    COUNT(CASE WHEN meeting_type = 'google_meet' THEN 1 END) AS google_meet_count,
    COUNT(CASE WHEN meeting_type = 'zoom' THEN 1 END) AS zoom_count,
    COUNT(CASE WHEN hangout_link IS NOT NULL AND meeting_url = hangout_link THEN 1 END) AS correctly_backfilled
FROM meetings;

-- 6. Sample data check (shows actual meeting records)
SELECT 
    'Sample Data' AS verification_step,
    google_event_id,
    title,
    hangout_link,
    meeting_url,
    meeting_type,
    status,
    created_at
FROM meetings
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================================
-- SUMMARY: All-in-one check
-- ============================================================================
SELECT 
    '📊 MIGRATION SUMMARY' AS summary,
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_name = 'meetings' 
     AND column_name IN ('meeting_type', 'meeting_url')) AS columns_added,
    (SELECT COUNT(*) FROM pg_indexes 
     WHERE tablename = 'meetings' 
     AND indexname = 'idx_meetings_meeting_type') AS indexes_created,
    (SELECT COUNT(*) FROM meetings WHERE meeting_url IS NOT NULL) AS meetings_with_url,
    (SELECT COUNT(*) FROM meetings WHERE meeting_type IS NOT NULL) AS meetings_with_type,
    CASE 
        WHEN (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_name = 'meetings' 
              AND column_name IN ('meeting_type', 'meeting_url')) = 2
        THEN '✅ Migration SUCCESSFUL'
        ELSE '❌ Migration INCOMPLETE'
    END AS status;

