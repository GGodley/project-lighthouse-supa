-- ============================================
-- CUSTOMER COUNT FEATURE - COMPLETE MIGRATION
-- ============================================
-- This file contains all 6 migrations combined into one
-- Copy and paste this entire file into Supabase SQL Editor
-- ============================================

-- ============================================
-- MIGRATION 1: Add active_customer_count column to profiles
-- ============================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS active_customer_count INTEGER DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_customer_count ON public.profiles(active_customer_count);

COMMENT ON COLUMN public.profiles.active_customer_count IS 'Denormalized count of active customers (excluding those from archived/deleted companies). Updated automatically via triggers.';

-- ============================================
-- MIGRATION 2: Create recalculate function
-- ============================================
CREATE OR REPLACE FUNCTION public.recalculate_user_customer_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.customers c
  INNER JOIN public.companies co ON c.company_id = co.company_id
  WHERE co.user_id = p_user_id
    AND (co.status IS NULL OR co.status != 'archived');
  
  UPDATE public.profiles
  SET active_customer_count = v_count
  WHERE id = p_user_id;
  
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.recalculate_user_customer_count(UUID) IS 'Recalculates and updates the active_customer_count for a user. Counts customers from non-archived companies.';

-- ============================================
-- MIGRATION 3: Create triggers
-- ============================================
CREATE OR REPLACE FUNCTION public.update_customer_count_on_customer_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT co.user_id INTO v_user_id
    FROM public.companies co
    WHERE co.company_id = OLD.company_id;
    
    IF v_user_id IS NOT NULL THEN
      PERFORM public.recalculate_user_customer_count(v_user_id);
    END IF;
  ELSE
    SELECT co.user_id INTO v_user_id
    FROM public.companies co
    WHERE co.company_id = NEW.company_id;
    
    IF v_user_id IS NOT NULL THEN
      PERFORM public.recalculate_user_customer_count(v_user_id);
    END IF;
  END IF;
  
  RETURN CASE
    WHEN TG_OP = 'DELETE' THEN OLD
    ELSE NEW
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_customer_count_on_company_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
      PERFORM public.recalculate_user_customer_count(NEW.user_id);
      
      IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
        PERFORM public.recalculate_user_customer_count(OLD.user_id);
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_user_customer_count(OLD.user_id);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.recalculate_user_customer_count(NEW.user_id);
  END IF;
  
  RETURN CASE
    WHEN TG_OP = 'DELETE' THEN OLD
    ELSE NEW
  END;
END;
$$;

DROP TRIGGER IF EXISTS update_customer_count_on_customer_change ON public.customers;
DROP TRIGGER IF EXISTS update_customer_count_on_company_change ON public.companies;

CREATE TRIGGER update_customer_count_on_customer_change
  AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_count_on_customer_change();

CREATE TRIGGER update_customer_count_on_company_change
  AFTER INSERT OR UPDATE OR DELETE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_count_on_company_change();

COMMENT ON FUNCTION public.update_customer_count_on_customer_change() IS 'Automatically updates active_customer_count when customers are inserted, updated, or deleted';
COMMENT ON FUNCTION public.update_customer_count_on_company_change() IS 'Automatically updates active_customer_count when company status changes (archive/restore/delete)';

-- ============================================
-- MIGRATION 4: Backfill existing counts
-- ============================================
UPDATE public.profiles p
SET active_customer_count = COALESCE((
  SELECT COUNT(*)
  FROM public.customers c
  INNER JOIN public.companies co ON c.company_id = co.company_id
  WHERE co.user_id = p.id
    AND (co.status IS NULL OR co.status != 'archived')
), 0);

COMMENT ON COLUMN public.profiles.active_customer_count IS 'Denormalized count of active customers. Backfilled for existing users on 2025-11-22.';

-- ============================================
-- MIGRATION 5: Create monthly_customer_counts table
-- ============================================
CREATE TABLE IF NOT EXISTS public.monthly_customer_counts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  customer_count INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_customer_counts_user_id ON public.monthly_customer_counts(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_customer_counts_user_year_month ON public.monthly_customer_counts(user_id, year DESC, month DESC);

ALTER TABLE public.monthly_customer_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own monthly counts" ON public.monthly_customer_counts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert monthly counts" ON public.monthly_customer_counts
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE public.monthly_customer_counts IS 'Historical monthly snapshots of active customer counts for trend analysis';

-- ============================================
-- MIGRATION 6: Create monthly recording function
-- ============================================
CREATE OR REPLACE FUNCTION public.record_monthly_customer_count(
  p_user_id UUID,
  p_record_previous_month BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count INTEGER;
  v_year INTEGER;
  v_month INTEGER;
  v_target_date DATE;
BEGIN
  IF p_record_previous_month THEN
    v_target_date := DATE_TRUNC('month', NOW()) - INTERVAL '1 month';
  ELSE
    v_target_date := DATE_TRUNC('month', NOW());
  END IF;
  
  v_year := EXTRACT(YEAR FROM v_target_date)::INTEGER;
  v_month := EXTRACT(MONTH FROM v_target_date)::INTEGER;
  
  SELECT active_customer_count
  INTO v_current_count
  FROM public.profiles
  WHERE id = p_user_id;
  
  v_current_count := COALESCE(v_current_count, 0);
  
  INSERT INTO public.monthly_customer_counts (user_id, year, month, customer_count, recorded_at)
  VALUES (p_user_id, v_year, v_month, v_current_count, NOW())
  ON CONFLICT (user_id, year, month)
  DO UPDATE SET
    customer_count = EXCLUDED.customer_count,
    recorded_at = EXCLUDED.recorded_at;
  
  RETURN v_current_count;
END;
$$;

COMMENT ON FUNCTION public.record_monthly_customer_count(UUID) IS 'Records the current active_customer_count as a monthly snapshot. Idempotent - can be called multiple times in the same month.';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

