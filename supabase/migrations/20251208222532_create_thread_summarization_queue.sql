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

