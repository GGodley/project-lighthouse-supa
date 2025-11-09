-- Add archive support to companies and domain_blocklist tables

-- 1. Add 'archived' status to companies table
ALTER TABLE public.companies 
DROP CONSTRAINT IF EXISTS companies_status_check;

ALTER TABLE public.companies
ADD CONSTRAINT companies_status_check 
CHECK (status IN ('active', 'inactive', 'at_risk', 'churned', 'archived'));

-- 2. Create domain_blocklist table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.domain_blocklist (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  domain TEXT NOT NULL,
  status TEXT DEFAULT 'deleted' CHECK (status IN ('archived', 'deleted')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_domain_blocklist_user_id ON public.domain_blocklist(user_id);
CREATE INDEX IF NOT EXISTS idx_domain_blocklist_domain ON public.domain_blocklist(domain);
CREATE INDEX IF NOT EXISTS idx_domain_blocklist_status ON public.domain_blocklist(status);

-- Enable Row Level Security
ALTER TABLE public.domain_blocklist ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own blocked domains" ON public.domain_blocklist
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own blocked domains" ON public.domain_blocklist
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own blocked domains" ON public.domain_blocklist
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own blocked domains" ON public.domain_blocklist
  FOR DELETE USING (auth.uid() = user_id);

-- 3. If domain_blocklist already exists, add status column if missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'domain_blocklist'
  ) THEN
    -- Add status column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'domain_blocklist' 
        AND column_name = 'status'
    ) THEN
      ALTER TABLE public.domain_blocklist
      ADD COLUMN status TEXT DEFAULT 'deleted' CHECK (status IN ('archived', 'deleted')) NOT NULL;
      
      -- Update existing rows to have 'deleted' status (default)
      UPDATE public.domain_blocklist SET status = 'deleted' WHERE status IS NULL;
    END IF;
  END IF;
END $$;

