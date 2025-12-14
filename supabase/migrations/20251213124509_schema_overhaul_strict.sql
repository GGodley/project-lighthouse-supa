-- Schema Overhaul Migration - Fix Multi-Tenancy Issues
-- This migration:
-- 1. Truncates existing data to ensure clean slate
-- 2. Fixes customers table with proper user_id and multi-tenancy
-- 3. Fixes companies table to ensure user_id is NOT NULL
-- 4. Creates thread_participants junction table
-- 5. Updates thread_processing_stages constraints

-- Step 1: Clean Slate (Critical)
-- TRUNCATE tables to remove data that violates new schema requirements
TRUNCATE TABLE public.customers, public.companies, public.thread_messages, public.threads CASCADE;

-- Step 2: Fix customers Table
DO $$
BEGIN
  -- Rename primary key column from 'id' to 'customer_id' if it exists as 'id'
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'id'
  ) THEN
    -- Check if customer_id already exists
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'customers'
        AND column_name = 'customer_id'
    ) THEN
      ALTER TABLE public.customers RENAME COLUMN id TO customer_id;
      RAISE NOTICE 'Renamed customers.id to customers.customer_id';
    END IF;
  END IF;

  -- Add user_id column if it doesn't exist or alter it to reference auth.users
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.customers
    ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added user_id column to customers table';
  ELSE
    -- Alter existing user_id to reference auth.users if it references profiles
    ALTER TABLE public.customers
    DROP CONSTRAINT IF EXISTS customers_user_id_fkey;
    
    ALTER TABLE public.customers
    ALTER COLUMN user_id SET NOT NULL;
    
    ALTER TABLE public.customers
    ADD CONSTRAINT customers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Updated user_id column in customers table to reference auth.users';
  END IF;

  -- Add company_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'company_id'
  ) THEN
    -- Add the column first
    ALTER TABLE public.customers
    ADD COLUMN company_id UUID;
    
    RAISE NOTICE 'Added company_id column to customers table';
  ELSE
    RAISE NOTICE 'company_id column already exists in customers table';
  END IF;

  -- Add foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.customers'::regclass
      AND conname = 'customers_company_id_fkey'
  ) THEN
    ALTER TABLE public.customers
    ADD CONSTRAINT customers_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(company_id) ON DELETE SET NULL;
    
    RAISE NOTICE 'Added customers_company_id_fkey constraint';
  ELSE
    RAISE NOTICE 'customers_company_id_fkey constraint already exists';
  END IF;

  -- Add domain_match column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'domain_match'
  ) THEN
    ALTER TABLE public.customers
    ADD COLUMN domain_match TEXT;
    RAISE NOTICE 'Added domain_match column to customers table';
  END IF;
END $$;

-- Enable Row Level Security on customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on customers
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.customers';
  END LOOP;
END $$;

-- Create new unified RLS policy for customers
CREATE POLICY "Users can only manage their own customers" ON public.customers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 3: Fix companies Table
DO $$
BEGIN
  -- Ensure user_id exists and is NOT NULL with proper foreign key
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'user_id'
  ) THEN
    -- Drop existing foreign key if it exists
    ALTER TABLE public.companies
    DROP CONSTRAINT IF EXISTS companies_user_id_fkey;
    
    -- Ensure NOT NULL
    ALTER TABLE public.companies
    ALTER COLUMN user_id SET NOT NULL;
    
    -- Add proper foreign key constraint
    ALTER TABLE public.companies
    ADD CONSTRAINT companies_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Updated user_id column in companies table';
  ELSE
    -- Add user_id if it doesn't exist
    ALTER TABLE public.companies
    ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Added user_id column to companies table';
  END IF;
END $$;

-- Enable Row Level Security on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on companies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.companies';
  END LOOP;
END $$;

-- Create new unified RLS policy for companies
CREATE POLICY "Users can only access their own companies" ON public.companies
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 4: Create thread_participants Table (The Bridge)
DROP TABLE IF EXISTS public.thread_participants;

CREATE TABLE public.thread_participants (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES public.threads(thread_id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(customer_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT thread_participants_thread_customer_unique UNIQUE (thread_id, customer_id)
);

-- Create indexes for thread_participants table
CREATE INDEX idx_thread_participants_thread_id ON public.thread_participants(thread_id);
CREATE INDEX idx_thread_participants_customer_id ON public.thread_participants(customer_id);
CREATE INDEX idx_thread_participants_user_id ON public.thread_participants(user_id);

-- Enable Row Level Security on thread_participants
ALTER TABLE public.thread_participants ENABLE ROW LEVEL SECURITY;

-- Create unified RLS policy for thread_participants
CREATE POLICY "Users can only manage their own thread participants" ON public.thread_participants
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Step 5: Update Processing Stages
DO $$
BEGIN
  -- Drop existing CHECK constraint on current_stage if it exists
  ALTER TABLE public.thread_processing_stages
  DROP CONSTRAINT IF EXISTS thread_processing_stages_current_stage_check;
  
  RAISE NOTICE 'Dropped existing current_stage CHECK constraint';
  
  -- Add new CHECK constraint with updated values
  ALTER TABLE public.thread_processing_stages
  ADD CONSTRAINT thread_processing_stages_current_stage_check
  CHECK (current_stage IN ('imported', 'resolving_entities', 'analyzing', 'completed', 'failed'));
  
  RAISE NOTICE 'Added new current_stage CHECK constraint';
END $$;

-- Add comments for documentation
COMMENT ON TABLE public.thread_participants IS 
  'Junction table enabling many-to-many relationships between threads and customers. Enforces strict multi-tenancy via user_id.';

COMMENT ON COLUMN public.customers.domain_match IS 
  'Stores the domain string extracted from the customer email, used for matching against companies.domain_name';

