-- Fix critical security bug: Customers table RLS policy
-- The current policy allows ALL authenticated users to see ALL customers
-- This migration fixes it to only allow users to see their own customers

-- Drop the permissive policy
DROP POLICY IF EXISTS "Customers select for authenticated" ON public.customers;

-- Create proper user-scoped policies for all operations
-- Customers are linked to users through company_id -> companies.user_id
-- This ensures users can only access customers belonging to their companies

-- Policy for SELECT: Users can only see customers from their own companies
CREATE POLICY "Users can view their own customers" ON public.customers
  FOR SELECT 
  USING (
    company_id IN (
      SELECT company_id FROM public.companies WHERE user_id = auth.uid()
    )
  );

-- Policy for INSERT: Users can only insert customers for their own companies
CREATE POLICY "Users can insert their own customers" ON public.customers
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.companies WHERE user_id = auth.uid()
    )
  );

-- Policy for UPDATE: Users can only update customers from their own companies
CREATE POLICY "Users can update their own customers" ON public.customers
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.companies WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.companies WHERE user_id = auth.uid()
    )
  );

-- Policy for DELETE: Users can only delete customers from their own companies
CREATE POLICY "Users can delete their own customers" ON public.customers
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.companies WHERE user_id = auth.uid()
    )
  );

-- Add comment
COMMENT ON POLICY "Users can view their own customers" ON public.customers IS 
  'CRITICAL SECURITY FIX: Ensures users can only see their own customers via company ownership, preventing cross-user data leakage';

