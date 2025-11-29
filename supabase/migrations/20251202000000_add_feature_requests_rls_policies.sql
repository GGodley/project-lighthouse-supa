-- Add Row Level Security policies for feature_requests table
-- This allows users to update feature requests for their own companies

-- Enable RLS if not already enabled
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view feature requests for their own companies
CREATE POLICY IF NOT EXISTS "Users can view feature requests for their companies"
ON public.feature_requests
FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM public.companies 
    WHERE user_id = auth.uid()
  )
);

-- Policy: Users can update feature requests for their own companies
CREATE POLICY IF NOT EXISTS "Users can update feature requests for their companies"
ON public.feature_requests
FOR UPDATE
USING (
  company_id IN (
    SELECT company_id 
    FROM public.companies 
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM public.companies 
    WHERE user_id = auth.uid()
  )
);

-- Policy: Users can insert feature requests for their own companies
CREATE POLICY IF NOT EXISTS "Users can insert feature requests for their companies"
ON public.feature_requests
FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM public.companies 
    WHERE user_id = auth.uid()
  )
);

