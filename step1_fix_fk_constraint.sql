-- ============================================
-- STEP 1: Fix Foreign Key Constraint to Avoid RLS Recursion
-- ============================================
-- The FK constraint on meeting_attendees.meeting_event_id -> meetings.google_event_id
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
ALTER TABLE public.meeting_attendees
ADD CONSTRAINT meeting_attendees_meeting_event_id_fkey
FOREIGN KEY (meeting_event_id)
REFERENCES public.meetings(google_event_id)
ON DELETE CASCADE
DEFERRABLE INITIALLY DEFERRED;

-- Verify the constraint was created
DO $$
DECLARE
  constraint_exists BOOLEAN;
BEGIN
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
  
  RAISE NOTICE 'Successfully created DEFERRABLE FK constraint on meeting_attendees.meeting_event_id';
END $$;

