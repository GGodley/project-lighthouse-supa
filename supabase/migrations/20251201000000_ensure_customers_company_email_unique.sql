-- Ensure unique constraint exists on customers(company_id, email)
-- This constraint is required for the company-customer-resolver utility
-- to work correctly with upsert operations

DO $$
BEGIN
  -- Check if the unique constraint already exists
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_company_id_email_key'
    AND conrelid = 'public.customers'::regclass
  ) THEN
    -- Create the unique constraint if it doesn't exist
    ALTER TABLE public.customers
    ADD CONSTRAINT customers_company_id_email_key
    UNIQUE (company_id, email);
    
    RAISE NOTICE 'Created unique constraint customers_company_id_email_key on (company_id, email)';
  ELSE
    RAISE NOTICE 'Unique constraint customers_company_id_email_key already exists';
  END IF;
END $$;

-- Create index for better query performance (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_customers_company_id_email 
ON public.customers(company_id, email);

