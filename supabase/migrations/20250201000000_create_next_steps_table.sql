-- Create next_steps table for enhanced next steps tracking
CREATE TABLE IF NOT EXISTS public.next_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(company_id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT false NOT NULL,
  owner TEXT,
  due_date TIMESTAMPTZ,
  source_type TEXT NOT NULL CHECK (source_type IN ('thread', 'meeting')),
  source_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_next_steps_company_id ON public.next_steps(company_id);
CREATE INDEX IF NOT EXISTS idx_next_steps_completed ON public.next_steps(completed);
CREATE INDEX IF NOT EXISTS idx_next_steps_source_type ON public.next_steps(source_type);
CREATE INDEX IF NOT EXISTS idx_next_steps_source_id ON public.next_steps(source_id);
CREATE INDEX IF NOT EXISTS idx_next_steps_user_id ON public.next_steps(user_id);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_next_steps_company_completed ON public.next_steps(company_id, completed);

-- Enable Row Level Security
ALTER TABLE public.next_steps ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own next steps"
  ON public.next_steps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own next steps"
  ON public.next_steps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own next steps"
  ON public.next_steps FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own next steps"
  ON public.next_steps FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_next_steps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER next_steps_updated_at
  BEFORE UPDATE ON public.next_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_next_steps_updated_at();

-- Add comments for documentation
COMMENT ON TABLE public.next_steps IS 'Stores next steps extracted from threads and meetings with completion tracking';
COMMENT ON COLUMN public.next_steps.company_id IS 'The company this next step belongs to';
COMMENT ON COLUMN public.next_steps.text IS 'The description of the next step';
COMMENT ON COLUMN public.next_steps.completed IS 'Whether this next step has been completed';
COMMENT ON COLUMN public.next_steps.owner IS 'The person responsible for completing this step (nullable)';
COMMENT ON COLUMN public.next_steps.due_date IS 'When this next step should be completed (nullable)';
COMMENT ON COLUMN public.next_steps.source_type IS 'The source type: thread or meeting';
COMMENT ON COLUMN public.next_steps.source_id IS 'The ID of the source (thread_id or meeting google_event_id)';

