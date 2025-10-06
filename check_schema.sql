-- Check the actual structure of the meetings table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'meetings' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if meeting_date column exists
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'meetings' 
AND table_schema = 'public' 
AND column_name = 'meeting_date';
