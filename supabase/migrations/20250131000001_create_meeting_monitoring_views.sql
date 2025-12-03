-- Create monitoring views for meetings requiring attention
-- These views help identify stuck meetings, errors, and other issues

-- View: meetings_requiring_attention
-- Identifies meetings that need manual intervention or monitoring
CREATE OR REPLACE VIEW meetings_requiring_attention AS
SELECT 
  m.id,
  m.google_event_id,
  m.user_id,
  m.title,
  m.status,
  m.dispatch_status,
  m.start_time,
  m.end_time,
  m.recall_bot_id,
  m.meeting_url,
  m.hangout_link,
  m.retry_count,
  m.last_error_at,
  m.error_details,
  m.updated_at,
  CASE 
    WHEN m.status = 'error' AND m.last_error_at > NOW() - INTERVAL '1 hour' THEN 'recent_error'
    WHEN m.status = 'scheduling_in_progress' AND m.updated_at < NOW() - INTERVAL '10 minutes' THEN 'stuck_scheduling'
    WHEN m.status = 'rescheduling' AND m.updated_at < NOW() - INTERVAL '5 minutes' THEN 'stuck_rescheduling'
    WHEN m.status = 'missing_url' AND m.end_time > NOW() THEN 'missing_url_future'
    ELSE 'other'
  END AS issue_type,
  EXTRACT(EPOCH FROM (NOW() - m.updated_at)) / 60 AS minutes_stuck
FROM meetings m
WHERE 
  -- Recent errors (within last hour)
  (m.status = 'error' AND m.last_error_at > NOW() - INTERVAL '1 hour')
  -- Stuck in scheduling_in_progress for > 10 minutes
  OR (m.status = 'scheduling_in_progress' AND m.updated_at < NOW() - INTERVAL '10 minutes')
  -- Stuck in rescheduling for > 5 minutes
  OR (m.status = 'rescheduling' AND m.updated_at < NOW() - INTERVAL '5 minutes')
  -- Missing URL for future meetings
  OR (m.status = 'missing_url' AND m.end_time > NOW())
ORDER BY 
  CASE 
    WHEN m.status = 'error' THEN 1
    WHEN m.status = 'scheduling_in_progress' THEN 2
    WHEN m.status = 'rescheduling' THEN 3
    WHEN m.status = 'missing_url' THEN 4
    ELSE 5
  END,
  m.updated_at ASC;

-- Add comment
COMMENT ON VIEW meetings_requiring_attention IS 'Meetings that require attention: errors, stuck processing, or missing URLs for future meetings';

-- View: meetings_stuck_in_processing
-- Specifically identifies meetings stuck in processing states
CREATE OR REPLACE VIEW meetings_stuck_in_processing AS
SELECT 
  m.id,
  m.google_event_id,
  m.user_id,
  m.title,
  m.status,
  m.dispatch_status,
  m.start_time,
  m.end_time,
  m.recall_bot_id,
  m.retry_count,
  m.last_error_at,
  m.error_details,
  m.updated_at,
  EXTRACT(EPOCH FROM (NOW() - m.updated_at)) / 60 AS minutes_stuck,
  CASE 
    WHEN m.status = 'scheduling_in_progress' THEN 'scheduling'
    WHEN m.status = 'rescheduling' THEN 'rescheduling'
    ELSE 'unknown'
  END AS stuck_state
FROM meetings m
WHERE 
  m.status IN ('scheduling_in_progress', 'rescheduling')
  AND (
    (m.status = 'scheduling_in_progress' AND m.updated_at < NOW() - INTERVAL '10 minutes')
    OR (m.status = 'rescheduling' AND m.updated_at < NOW() - INTERVAL '5 minutes')
  )
ORDER BY m.updated_at ASC;

-- Add comment
COMMENT ON VIEW meetings_stuck_in_processing IS 'Meetings stuck in processing states (scheduling_in_progress or rescheduling) for extended periods';

-- View: meetings_with_high_retry_count
-- Identifies meetings that have failed multiple times
CREATE OR REPLACE VIEW meetings_with_high_retry_count AS
SELECT 
  m.id,
  m.google_event_id,
  m.user_id,
  m.title,
  m.status,
  m.retry_count,
  m.last_error_at,
  m.error_details,
  m.start_time,
  m.end_time,
  m.meeting_url,
  m.hangout_link
FROM meetings m
WHERE 
  m.retry_count >= 2
ORDER BY m.retry_count DESC, m.last_error_at DESC;

-- Add comment
COMMENT ON VIEW meetings_with_high_retry_count IS 'Meetings with high retry counts (>= 2), indicating persistent issues';

-- View: meetings_missing_urls
-- Identifies future meetings without URLs
CREATE OR REPLACE VIEW meetings_missing_urls AS
SELECT 
  m.id,
  m.google_event_id,
  m.user_id,
  m.title,
  m.status,
  m.start_time,
  m.end_time,
  m.error_details,
  m.last_error_at,
  CASE 
    WHEN m.end_time > NOW() THEN 'future'
    WHEN m.end_time <= NOW() THEN 'past'
    ELSE 'unknown'
  END AS time_status
FROM meetings m
WHERE 
  m.status = 'missing_url'
  AND m.end_time > NOW() -- Only future meetings
ORDER BY m.start_time ASC;

-- Add comment
COMMENT ON VIEW meetings_missing_urls IS 'Future meetings that are missing meeting URLs';

