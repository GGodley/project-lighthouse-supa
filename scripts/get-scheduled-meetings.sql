-- Query to get all meetings with status 'recording_scheduled' and their recall_bot_id values
-- Run this in Supabase SQL Editor and copy the JSON result
-- The result will be a JSON object with a "meetings" array

SELECT 
  json_build_object(
    'meetings', json_agg(
      json_build_object(
        'recall_bot_id', recall_bot_id,
        'google_event_id', google_event_id,
        'title', title,
        'start_time', start_time,
        'status', status
      )
    )
  ) as result
FROM meetings
WHERE status = 'recording_scheduled'
  AND recall_bot_id IS NOT NULL;

