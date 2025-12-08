-- Combined migration: Apply all three new thread sync tables
-- Migration 1: thread_processing_stages
-- Create thread_processing_stages table for parallel staged thread processing
-- Tracks each thread through 5 stages: import → preprocess → clean → chunk → summarize

CREATE TABLE IF NOT EXISTS public.thread_processing_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sync_job_id BIGINT REFERENCES sync_jobs(id) ON DELETE CASCADE,
  
  -- Stage flags (each stage must complete before next can start)
  stage_imported BOOLEAN DEFAULT FALSE,
  stage_preprocessed BOOLEAN DEFAULT FALSE,
  stage_body_cleaned BOOLEAN DEFAULT FALSE,
  stage_chunked BOOLEAN DEFAULT FALSE,
  stage_summarized BOOLEAN DEFAULT FALSE,
  
  -- Stage timestamps
  imported_at TIMESTAMPTZ,
  preprocessed_at TIMESTAMPTZ,
  body_cleaned_at TIMESTAMPTZ,
  chunked_at TIMESTAMPTZ,
  summarized_at TIMESTAMPTZ,
  
  -- Stage error tracking
  import_error TEXT,
  preprocess_error TEXT,
  clean_error TEXT,
  chunk_error TEXT,
  summarize_error TEXT,
  
  -- Stage retry tracking
  import_attempts INTEGER DEFAULT 0,
  preprocess_attempts INTEGER DEFAULT 0,
  clean_attempts INTEGER DEFAULT 0,
  chunk_attempts INTEGER DEFAULT 0,
  summarize_attempts INTEGER DEFAULT 0,
  
  -- Data storage (JSONB for flexibility)
  raw_thread_data JSONB, -- Stage 1: Raw Gmail data
  preprocessed_data JSONB, -- Stage 2: With company/customer IDs
  cleaned_body_data JSONB, -- Stage 3: Cleaned body text
  chunks_data JSONB, -- Stage 4: Array of chunks
  summary_data JSONB, -- Stage 5: Final summary
  
  -- Status tracking
  current_stage TEXT CHECK (current_stage IN (
    'pending', 'importing', 'preprocessing', 'cleaning', 
    'chunking', 'summarizing', 'completed', 'failed'
  )) DEFAULT 'pending',
  
  -- Retry scheduling
  next_retry_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_thread_stages_current_stage ON thread_processing_stages(current_stage, updated_at)
  WHERE current_stage IN ('pending', 'importing', 'preprocessing', 'cleaning', 'chunking', 'summarizing');
CREATE INDEX IF NOT EXISTS idx_thread_stages_thread_id ON thread_processing_stages(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_stages_job_id ON thread_processing_stages(sync_job_id);
CREATE INDEX IF NOT EXISTS idx_thread_stages_user_id ON thread_processing_stages(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_stages_next_retry ON thread_processing_stages(next_retry_at)
  WHERE next_retry_at IS NOT NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_thread_stages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_thread_stages_updated_at
  BEFORE UPDATE ON thread_processing_stages
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_stages_updated_at();

-- Enable Row Level Security
ALTER TABLE thread_processing_stages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own thread processing stages" ON thread_processing_stages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all thread processing stages" ON thread_processing_stages
  FOR ALL USING (true);

-- Add comments for documentation
COMMENT ON TABLE thread_processing_stages IS 'Tracks each thread through 5 processing stages with error handling and retry logic';
COMMENT ON COLUMN thread_processing_stages.current_stage IS 'Current processing stage: pending → importing → preprocessing → cleaning → chunking → summarizing → completed';
COMMENT ON COLUMN thread_processing_stages.raw_thread_data IS 'Raw thread data from Gmail API (Stage 1)';
COMMENT ON COLUMN thread_processing_stages.preprocessed_data IS 'Thread data with company/customer IDs resolved (Stage 2)';
COMMENT ON COLUMN thread_processing_stages.cleaned_body_data IS 'Thread data with cleaned body text (Stage 3)';
COMMENT ON COLUMN thread_processing_stages.chunks_data IS 'Array of chunks for OpenAI processing (Stage 4)';
COMMENT ON COLUMN thread_processing_stages.summary_data IS 'Final OpenAI summary (Stage 5)';

-- Migration 2: sync_page_queue
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

-- Migration 3: thread_summarization_queue
-- Create thread_summarization_queue table for async summarization
-- Separates summarization from thread import for non-blocking processing

CREATE TABLE IF NOT EXISTS public.thread_summarization_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  thread_stage_id UUID REFERENCES thread_processing_stages(id) ON DELETE CASCADE,
  
  -- Messages data for summarization
  messages JSONB NOT NULL, -- Array of message objects from Gmail
  user_email TEXT NOT NULL, -- CSM email for role identification
  
  -- Chunking info (if already chunked)
  chunks_data JSONB, -- Pre-chunked data (optional, can be chunked here)
  requires_map_reduce BOOLEAN DEFAULT FALSE,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Error tracking
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_thread_summarization_queue_status ON thread_summarization_queue(status, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_thread_summarization_queue_thread_id ON thread_summarization_queue(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_summarization_queue_user_id ON thread_summarization_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_summarization_queue_stage_id ON thread_summarization_queue(thread_stage_id);

-- Enable Row Level Security
ALTER TABLE thread_summarization_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own summarization jobs" ON thread_summarization_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all summarization jobs" ON thread_summarization_queue
  FOR ALL USING (true);

-- Add comments for documentation
COMMENT ON TABLE thread_summarization_queue IS 'Async queue for OpenAI summarization, separate from thread import';
COMMENT ON COLUMN thread_summarization_queue.messages IS 'Array of message objects from Gmail API for summarization';
COMMENT ON COLUMN thread_summarization_queue.chunks_data IS 'Pre-chunked data if chunking was done in previous stage';

-- Mark migrations as applied in schema_migrations table
INSERT INTO supabase_migrations.schema_migrations(version, name) 
VALUES 
  ('20251208222530', 'create_thread_processing_stages'),
  ('20251208222531', 'create_sync_page_queue'),
  ('20251208222532', 'create_thread_summarization_queue')
ON CONFLICT (version) DO NOTHING;

