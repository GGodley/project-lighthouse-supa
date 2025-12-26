-- Add 'blocked' status to task_status enum
-- This migration adds the 'blocked' value to the existing task_status enum

DO $$
BEGIN
  -- Check if 'blocked' already exists in task_status enum
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'blocked' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status')
  ) THEN
    -- Add 'blocked' to task_status enum
    ALTER TYPE task_status ADD VALUE 'blocked';
    RAISE NOTICE 'Added blocked value to task_status enum';
  ELSE
    RAISE NOTICE 'blocked value already exists in task_status enum';
  END IF;
END $$;

