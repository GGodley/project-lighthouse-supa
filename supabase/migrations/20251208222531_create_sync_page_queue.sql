-- Create sync_page_queue table for managing Gmail API pagination with retry logic
-- Prevents stuck jobs by tracking page processing in database

CREATE TABLE IF NOT EXISTS public.sync_page_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_job_id BIGINT REFERENCES sync_jobs(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider_token TEXT NOT NULL, -- Encrypted in production (store securely)
  page_token TEXT, -- NULL for first page
  page_number INTEGER NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  
  -- Retry tracking
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  next_retry_at TIMESTAMPTZ,
  
  -- Idempotency (prevents duplicate processing)
  idempotency_key TEXT UNIQUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sync_page_queue_status ON sync_page_queue(status, next_retry_at) 
  WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_sync_page_queue_job_id ON sync_page_queue(sync_job_id);
CREATE INDEX IF NOT EXISTS idx_sync_page_queue_idempotency ON sync_page_queue(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sync_page_queue_user_id ON sync_page_queue(user_id);

-- Enable Row Level Security
ALTER TABLE sync_page_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own page queue jobs" ON sync_page_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all page queue jobs" ON sync_page_queue
  FOR ALL USING (true);

-- Add comments for documentation
COMMENT ON TABLE sync_page_queue IS 'Manages Gmail API pagination with retry logic and idempotency';
COMMENT ON COLUMN sync_page_queue.idempotency_key IS 'Unique key to prevent duplicate page processing: ${sync_job_id}-page-${page_number}';
COMMENT ON COLUMN sync_page_queue.provider_token IS 'Gmail OAuth token (should be encrypted in production)';

