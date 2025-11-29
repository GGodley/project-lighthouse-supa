-- Diagnostic SQL to debug why feature requests aren't showing on dashboard
-- Run this in Supabase SQL Editor to check the data state

-- 1. Check total feature requests in database
SELECT 
  COUNT(*) as total_feature_requests,
  COUNT(DISTINCT company_id) as unique_companies,
  COUNT(DISTINCT feature_id) as unique_features
FROM feature_requests;

-- 2. Check feature requests by company status
SELECT 
  c.status,
  COUNT(fr.id) as feature_request_count
FROM feature_requests fr
LEFT JOIN companies c ON fr.company_id = c.company_id
GROUP BY c.status
ORDER BY feature_request_count DESC;

-- 3. Check if feature requests have matching features
SELECT 
  COUNT(*) as feature_requests_with_features,
  COUNT(*) FILTER (WHERE f.id IS NULL) as feature_requests_without_features
FROM feature_requests fr
LEFT JOIN features f ON fr.feature_id = f.id;

-- 4. Sample feature requests with their companies and features
SELECT 
  fr.id,
  fr.company_id,
  c.company_name,
  c.status as company_status,
  c.user_id,
  fr.feature_id,
  f.title as feature_title,
  fr.source,
  fr.completed,
  fr.requested_at
FROM feature_requests fr
LEFT JOIN companies c ON fr.company_id = c.company_id
LEFT JOIN features f ON fr.feature_id = f.id
ORDER BY fr.requested_at DESC
LIMIT 20;

-- 5. Check feature requests for a specific user (replace USER_ID with actual user ID)
-- SELECT 
--   fr.id,
--   fr.company_id,
--   c.company_name,
--   c.status as company_status,
--   c.user_id,
--   fr.feature_id,
--   f.title as feature_title,
--   fr.source,
--   fr.completed
-- FROM feature_requests fr
-- LEFT JOIN companies c ON fr.company_id = c.company_id
-- LEFT JOIN features f ON fr.feature_id = f.id
-- WHERE c.user_id = 'USER_ID'
--   AND c.status NOT IN ('archived', 'deleted')
-- ORDER BY fr.requested_at DESC;

