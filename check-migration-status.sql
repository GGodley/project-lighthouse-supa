-- Quick Check: Verify if migration has been applied
-- Run this FIRST to see if you need to apply the migration

-- Check if columns exist
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'meetings' 
              AND column_name = 'meeting_type'
        ) AND EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'meetings' 
              AND column_name = 'meeting_url'
        )
        THEN '✅ Migration APPLIED - Columns exist'
        ELSE '❌ Migration NOT APPLIED - Run apply-meeting-type-migration.sql first'
    END AS migration_status;

-- If migration is applied, show column details
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'meetings' 
  AND column_name IN ('meeting_type', 'meeting_url')
ORDER BY column_name;

