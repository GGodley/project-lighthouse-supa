-- Fix company deletion cascade to ensure all related data is properly deleted
-- This migration ensures that when a company is deleted:
-- 1. thread_company_link entries are deleted (already has CASCADE)
-- 2. customers with that company_id are deleted (add CASCADE if not exists)
-- 3. thread_messages customer_id is set to NULL (already has SET NULL)

-- First, check if customers table has company_id column
DO $$
BEGIN
  -- Check if company_id column exists in customers table
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'customers' 
      AND column_name = 'company_id'
  ) THEN
    -- Drop the existing foreign key if it exists (regardless of CASCADE setting)
    ALTER TABLE public.customers 
    DROP CONSTRAINT IF EXISTS customers_company_id_fkey;
    
    -- Recreate with CASCADE to ensure proper deletion
    ALTER TABLE public.customers
    ADD CONSTRAINT customers_company_id_fkey
    FOREIGN KEY (company_id)
    REFERENCES public.companies(company_id)
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Updated customers_company_id_fkey to use ON DELETE CASCADE';
  ELSE
    RAISE NOTICE 'customers table does not have company_id column - skipping foreign key update';
  END IF;
END $$;

