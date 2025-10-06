-- Add email column to customers table if it doesn't exist
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index for email column if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
