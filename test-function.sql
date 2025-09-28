-- Test script to verify the function works
-- Run this in your Supabase SQL Editor

-- 1. First, let's see the table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'feature_requests' 
ORDER BY ordinal_position;

-- 2. Check if there are any existing feature requests
SELECT COUNT(*) as total_requests FROM public.feature_requests;

-- 3. Test the function with your user ID
SELECT * FROM get_user_feature_analytics('205055ce-066a-4b48-ade4-111052efc2fb');

-- 4. If the table is empty, insert some test data
-- (Uncomment the lines below if you want to insert test data)

/*
INSERT INTO public.feature_requests (title, urgency, user_id, created_at) VALUES
('API Rate Limiting', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('API Rate Limiting', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('API Rate Limiting', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Advanced Analytics', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Advanced Analytics', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Advanced Analytics', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW());
*/

-- 5. Test the function again after inserting data
-- SELECT * FROM get_user_feature_analytics('205055ce-066a-4b48-ade4-111052efc2fb');
