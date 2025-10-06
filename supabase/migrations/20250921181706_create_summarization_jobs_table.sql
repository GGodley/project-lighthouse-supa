-- Create summarization_jobs table
CREATE TABLE IF NOT EXISTS public.summarization_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email_id UUID NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_summarization_jobs_status ON public.summarization_jobs(status);
CREATE INDEX IF NOT EXISTS idx_summarization_jobs_email_id ON public.summarization_jobs(email_id);
CREATE INDEX IF NOT EXISTS idx_summarization_jobs_created_at ON public.summarization_jobs(created_at);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_summarization_jobs_updated_at 
    BEFORE UPDATE ON public.summarization_jobs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE public.summarization_jobs ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read their own jobs
CREATE POLICY "Users can view their own summarization jobs" ON public.summarization_jobs
    FOR SELECT USING (
        email_id IN (
            SELECT id FROM public.emails 
            WHERE user_id = auth.uid()
        )
    );

-- Policy for service role to manage all jobs (for the edge function)
CREATE POLICY "Service role can manage all summarization jobs" ON public.summarization_jobs
    FOR ALL USING (true);

-- Add summary column to emails table if it doesn't exist
ALTER TABLE public.emails 
ADD COLUMN IF NOT EXISTS summary TEXT;
