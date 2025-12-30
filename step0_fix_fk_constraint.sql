-- ============================================
-- STEP 0: Fix Foreign Key Constraint to Avoid RLS Recursion
-- ============================================
-- CRITICAL: Run this FIRST before any other steps
--
-- The problem: The FK constraint on meeting_attendees.meeting_event_id -> meetings.google_event_id
-- is being validated during queries, which triggers the RLS policy on meetings,
-- causing infinite recursion.
--
-- Solution: Make the FK constraint DEFERRABLE INITIALLY DEFERRED
-- This defers FK validation until the end of the transaction, avoiding recursion
-- ============================================

-- First, drop the existing FK constraint
ALTER TABLE public.meeting_attendees
DROP CONSTRAINT IF EXISTS meeting_attendees_meeting_event_id_fkey;

-- Recreate it as DEFERRABLE INITIALLY DEFERRED
-- This means FK validation happens at transaction end, not during queries
-- This prevents the FK validation from triggering RLS policies during query execution
ALTER TABLE public.meeting_attendees
ADD CONSTRAINT meeting_attendees_meeting_event_id_fkey
FOREIGN KEY (meeting_event_id)
REFERENCES public.meetings(google_event_id)
ON DELETE CASCADE
DEFERRABLE INITIALLY DEFERRED;

-- Verify the constraint was created correctly
DO $$
DECLARE
  constraint_exists BOOLEAN;
  is_deferrable BOOLEAN;
BEGIN
  -- Check if constraint exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'meeting_attendees'
      AND constraint_name = 'meeting_attendees_meeting_event_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) INTO constraint_exists;
  
  IF NOT constraint_exists THEN
    RAISE EXCEPTION 'Failed to create deferrable FK constraint';
  END IF;
  
  -- Check if it's actually deferrable
  SELECT pg_constraint.condeferrable
  INTO is_deferrable
  FROM pg_constraint
  JOIN pg_class ON pg_constraint.conrelid = pg_class.oid
  JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
  WHERE pg_namespace.nspname = 'public'
    AND pg_class.relname = 'meeting_attendees'
    AND pg_constraint.conname = 'meeting_attendees_meeting_event_id_fkey';
  
  IF NOT is_deferrable THEN
    RAISE EXCEPTION 'FK constraint was created but is not deferrable';
  END IF;
  
  RAISE NOTICE 'Successfully created DEFERRABLE INITIALLY DEFERRED FK constraint on meeting_attendees.meeting_event_id';
  RAISE NOTICE 'FK validation will now be deferred until transaction end, preventing RLS recursion';
END $$;

