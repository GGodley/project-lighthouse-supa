-- Fix companies with NULL status - set them to 'active' as default
-- This ensures all companies have a valid status and appear in queries

UPDATE public.companies
SET status = 'active'
WHERE status IS NULL;

-- Ensure the default constraint is set (in case it wasn't applied)
ALTER TABLE public.companies
ALTER COLUMN status SET DEFAULT 'active';

-- Add a comment explaining the status values
COMMENT ON COLUMN public.companies.status IS 'Company status: active, inactive, at_risk, churned, or archived. Defaults to active.';




