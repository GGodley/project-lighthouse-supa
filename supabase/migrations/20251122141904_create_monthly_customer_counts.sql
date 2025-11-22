-- Create table to store historical monthly customer count snapshots
-- This allows tracking customer growth over time

CREATE TABLE IF NOT EXISTS public.monthly_customer_counts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  customer_count INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, year, month)
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_monthly_customer_counts_user_id ON public.monthly_customer_counts(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_customer_counts_user_year_month ON public.monthly_customer_counts(user_id, year DESC, month DESC);

-- Enable Row Level Security
ALTER TABLE public.monthly_customer_counts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own monthly counts" ON public.monthly_customer_counts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert monthly counts" ON public.monthly_customer_counts
  FOR INSERT WITH CHECK (true); -- Service role inserts via Edge Function

-- Add comment
COMMENT ON TABLE public.monthly_customer_counts IS 'Historical monthly snapshots of active customer counts for trend analysis';

