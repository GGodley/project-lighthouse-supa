-- Diagnostic SQL script to identify feature requests with NULL thread_id
-- This helps identify the scope of the problem and potential backfill strategy

-- 1. Count feature requests with NULL thread_id where source='thread'
SELECT 
  COUNT(*) as null_thread_id_count,
  COUNT(DISTINCT company_id) as affected_companies,
  COUNT(DISTINCT customer_id) as affected_customers
FROM feature_requests
WHERE source = 'thread' 
  AND thread_id IS NULL;

-- 2. Show sample records with NULL thread_id
SELECT 
  fr.id,
  fr.feature_id,
  f.title as feature_title,
  fr.company_id,
  fr.customer_id,
  fr.source,
  fr.thread_id,
  fr.requested_at,
  fr.urgency,
  c.company_name
FROM feature_requests fr
LEFT JOIN features f ON fr.feature_id = f.id
LEFT JOIN companies c ON fr.company_id = c.company_id
WHERE fr.source = 'thread' 
  AND fr.thread_id IS NULL
ORDER BY fr.requested_at DESC
LIMIT 20;

-- 3. Check if we can backfill thread_id from thread_company_link table
-- This query finds feature_requests that might be linkable to threads via company_id
SELECT 
  fr.id as feature_request_id,
  fr.company_id,
  fr.requested_at,
  tcl.thread_id,
  t.last_message_date,
  CASE 
    WHEN ABS(EXTRACT(EPOCH FROM (fr.requested_at::timestamp - t.last_message_date::timestamp))) < 86400 
    THEN 'Within 24 hours'
    WHEN ABS(EXTRACT(EPOCH FROM (fr.requested_at::timestamp - t.last_message_date::timestamp))) < 604800 
    THEN 'Within 7 days'
    ELSE 'More than 7 days'
  END as time_proximity
FROM feature_requests fr
INNER JOIN thread_company_link tcl ON fr.company_id = tcl.company_id
INNER JOIN threads t ON tcl.thread_id = t.thread_id
WHERE fr.source = 'thread' 
  AND fr.thread_id IS NULL
  AND ABS(EXTRACT(EPOCH FROM (fr.requested_at::timestamp - t.last_message_date::timestamp))) < 604800  -- Within 7 days
ORDER BY ABS(EXTRACT(EPOCH FROM (fr.requested_at::timestamp - t.last_message_date::timestamp)))
LIMIT 50;

-- 4. Summary by company showing NULL thread_id counts
SELECT 
  c.company_name,
  COUNT(*) as null_thread_id_count,
  MIN(fr.requested_at) as earliest_request,
  MAX(fr.requested_at) as latest_request
FROM feature_requests fr
LEFT JOIN companies c ON fr.company_id = c.company_id
WHERE fr.source = 'thread' 
  AND fr.thread_id IS NULL
GROUP BY c.company_name
ORDER BY null_thread_id_count DESC;

-- 5. Check feature requests that DO have thread_id (for comparison)
SELECT 
  COUNT(*) as with_thread_id_count,
  COUNT(DISTINCT thread_id) as unique_threads,
  COUNT(DISTINCT company_id) as companies_with_thread_id
FROM feature_requests
WHERE source = 'thread' 
  AND thread_id IS NOT NULL;

