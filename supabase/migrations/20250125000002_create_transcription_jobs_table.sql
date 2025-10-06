-- Create transcription_jobs table to store AssemblyAI transcription jobs
CREATE TABLE IF NOT EXISTS public.transcription_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assemblyai_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  meeting_id BIGINT REFERENCES public.meetings(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  audio_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'error')),
  
  -- Transcription results
  transcript_text TEXT,
  summary TEXT,
  highlights JSONB,
  sentiment_analysis JSONB,
  entities JSONB,
  iab_categories JSONB,
  utterances JSONB,
  
  -- Error handling
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_user_id ON public.transcription_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_assemblyai_id ON public.transcription_jobs(assemblyai_id);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_meeting_id ON public.transcription_jobs(meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_customer_id ON public.transcription_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status ON public.transcription_jobs(status);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_created_at ON public.transcription_jobs(created_at);

-- Enable Row Level Security
ALTER TABLE public.transcription_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own transcription jobs" ON public.transcription_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transcription jobs" ON public.transcription_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transcription jobs" ON public.transcription_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transcription jobs" ON public.transcription_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can manage all transcription jobs (for webhook)
CREATE POLICY "Service role can manage all transcription jobs" ON public.transcription_jobs
  FOR ALL USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_transcription_jobs_updated_at 
  BEFORE UPDATE ON public.transcription_jobs 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
