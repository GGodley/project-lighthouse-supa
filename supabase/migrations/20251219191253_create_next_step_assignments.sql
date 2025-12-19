-- Create next_step_assignments table for many-to-many relationship
-- between next_steps and customers
CREATE TABLE IF NOT EXISTS public.next_step_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  next_step_id UUID REFERENCES public.next_steps(step_id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES public.customers(customer_id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT next_step_assignments_unique UNIQUE (next_step_id, customer_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_next_step_assignments_next_step_id ON public.next_step_assignments(next_step_id);
CREATE INDEX IF NOT EXISTS idx_next_step_assignments_customer_id ON public.next_step_assignments(customer_id);

-- Enable Row Level Security
ALTER TABLE public.next_step_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view next step assignments for their next steps"
  ON public.next_step_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.next_steps ns
      WHERE ns.step_id = next_step_assignments.next_step_id
        AND ns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert next step assignments for their next steps"
  ON public.next_step_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.next_steps ns
      WHERE ns.step_id = next_step_assignments.next_step_id
        AND ns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete next step assignments for their next steps"
  ON public.next_step_assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.next_steps ns
      WHERE ns.step_id = next_step_assignments.next_step_id
        AND ns.user_id = auth.uid()
    )
  );

-- Add comments for documentation
COMMENT ON TABLE public.next_step_assignments IS 'Junction table linking next_steps to customers, allowing one next step to be assigned to multiple customers';
COMMENT ON COLUMN public.next_step_assignments.next_step_id IS 'Foreign key to next_steps.step_id';
COMMENT ON COLUMN public.next_step_assignments.customer_id IS 'Foreign key to customers.customer_id';

-- Backfill existing next_steps from threads
-- This populates next_step_assignments for all existing thread-based next steps
-- by joining with thread_participants to find associated customers
INSERT INTO public.next_step_assignments (next_step_id, customer_id, created_at)
SELECT DISTINCT
  ns.step_id as next_step_id,
  tp.customer_id,
  COALESCE(ns.created_at, NOW()) as created_at
FROM public.next_steps ns
INNER JOIN public.thread_participants tp 
  ON tp.thread_id = ns.thread_id 
  AND tp.user_id = ns.user_id
WHERE ns.thread_id IS NOT NULL
  AND ns.step_id IS NOT NULL
  AND tp.customer_id IS NOT NULL
  -- Avoid duplicates (in case backfill is run multiple times)
  AND NOT EXISTS (
    SELECT 1 FROM public.next_step_assignments nsa
    WHERE nsa.next_step_id = ns.step_id
      AND nsa.customer_id = tp.customer_id
  )
ON CONFLICT (next_step_id, customer_id) DO NOTHING;

