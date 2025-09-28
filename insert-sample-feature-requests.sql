-- Sample feature requests data for testing
-- Run this in your Supabase SQL Editor

-- First, let's check the table structure
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'feature_requests';

-- Insert sample data (adjust column names based on your actual table structure)
INSERT INTO public.feature_requests (title, urgency, user_id, created_at) VALUES
('API Rate Limiting', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('API Rate Limiting', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('API Rate Limiting', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('API Rate Limiting', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('API Rate Limiting', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('API Rate Limiting', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),

('Advanced Analytics', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Advanced Analytics', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Advanced Analytics', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Advanced Analytics', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Advanced Analytics', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Advanced Analytics', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),

('SSO Integration', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('SSO Integration', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('SSO Integration', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('SSO Integration', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('SSO Integration', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('SSO Integration', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),

('CSV Export', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('CSV Export', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('CSV Export', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('CSV Export', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('CSV Export', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('CSV Export', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),

('Custom Reports', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Custom Reports', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Custom Reports', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Custom Reports', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Custom Reports', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),

('Mobile App Improvements', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Mobile App Improvements', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Mobile App Improvements', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Mobile App Improvements', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),

('Real-time Notifications', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Real-time Notifications', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Real-time Notifications', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Real-time Notifications', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Real-time Notifications', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Real-time Notifications', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),

('Data Visualization', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Data Visualization', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Data Visualization', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Data Visualization', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Data Visualization', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Data Visualization', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),

('User Permissions', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('User Permissions', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('User Permissions', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('User Permissions', 'low', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),

('Performance Optimization', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Performance Optimization', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Performance Optimization', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Performance Optimization', 'high', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Performance Optimization', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW()),
('Performance Optimization', 'medium', '205055ce-066a-4b48-ade4-111052efc2fb', NOW());
