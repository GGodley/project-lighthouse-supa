-- Apply the three new thread sync migrations
-- This script applies the migrations and marks them in schema_migrations

-- Migration 1: thread_processing_stages
\i supabase/migrations/20251208222530_create_thread_processing_stages.sql

-- Migration 2: sync_page_queue  
\i supabase/migrations/20251208222531_create_sync_page_queue.sql

-- Migration 3: thread_summarization_queue
\i supabase/migrations/20251208222532_create_thread_summarization_queue.sql

-- Mark migrations as applied
INSERT INTO supabase_migrations.schema_migrations(version, name) 
VALUES 
  ('20251208222530', 'create_thread_processing_stages'),
  ('20251208222531', 'create_sync_page_queue'),
  ('20251208222532', 'create_thread_summarization_queue')
ON CONFLICT (version) DO NOTHING;

