-- Check the actual schema of meeting_attendees table
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'meeting_attendees'
ORDER BY ordinal_position;

