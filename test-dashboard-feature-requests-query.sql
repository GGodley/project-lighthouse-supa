-- Test query to debug why feature requests aren't showing on dashboard
-- Replace USER_ID with your actual user ID from the dashboard logs

-- Step 1: Get user's companies
SELECT 
  company_id,
  company_name,
  status,
  user_id
FROM companies
WHERE user_id = 'USER_ID'  -- Replace with actual user ID
ORDER BY company_name;

-- Step 2: Get active companies (excluding archived/deleted)
SELECT 
  company_id,
  company_name,
  status
FROM companies
WHERE user_id = 'USER_ID'  -- Replace with actual user ID
  AND status NOT IN ('archived', 'deleted')
ORDER BY company_name;

-- Step 3: Check feature requests for those companies
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
INNER JOIN companies c ON fr.company_id = c.company_id
LEFT JOIN features f ON fr.feature_id = f.id
WHERE c.user_id = 'USER_ID'  -- Replace with actual user ID
  AND c.status NOT IN ('archived', 'deleted')
ORDER BY fr.requested_at DESC
LIMIT 50;

-- Step 4: Count feature requests by company
SELECT 
  c.company_id,
  c.company_name,
  c.status,
  COUNT(fr.id) as feature_request_count
FROM companies c
LEFT JOIN feature_requests fr ON c.company_id = fr.company_id
WHERE c.user_id = 'USER_ID'  -- Replace with actual user ID
  AND c.status NOT IN ('archived', 'deleted')
GROUP BY c.company_id, c.company_name, c.status
ORDER BY feature_request_count DESC;

-- Step 5: Check if feature requests have matching features
SELECT 
  COUNT(*) as total_feature_requests,
  COUNT(f.id) as with_matching_features,
  COUNT(*) FILTER (WHERE f.id IS NULL) as without_matching_features
FROM feature_requests fr
INNER JOIN companies c ON fr.company_id = c.company_id
LEFT JOIN features f ON fr.feature_id = f.id
WHERE c.user_id = 'USER_ID'  -- Replace with actual user ID
  AND c.status NOT IN ('archived', 'deleted');

