-- Add ENUMs, columns, and migrate data for next_steps table
-- This migration:
-- 1. Creates task_priority and task_status ENUMs
-- 2. Adds requested_by_contact_id, assigned_to_user_id, priority, and status columns
-- 3. Migrates existing completed boolean to status enum
-- 4. Adds indexes for performance

-- Step 1a: Create ENUM Types
DO $$
BEGIN
  -- Create task_priority ENUM if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM ('high', 'medium', 'low');
    RAISE NOTICE 'Created task_priority ENUM';
  ELSE
    RAISE NOTICE 'task_priority ENUM already exists';
  END IF;

  -- Create task_status ENUM if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
    RAISE NOTICE 'Created task_status ENUM';
  ELSE
    RAISE NOTICE 'task_status ENUM already exists';
  END IF;
END $$;

-- Step 1b: Add New Columns to next_steps Table
DO $$
BEGIN
  -- Add requested_by_contact_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'next_steps'
      AND column_name = 'requested_by_contact_id'
  ) THEN
    ALTER TABLE public.next_steps
    ADD COLUMN requested_by_contact_id UUID REFERENCES public.customers(customer_id) ON DELETE SET NULL;
    RAISE NOTICE 'Added requested_by_contact_id column';
  ELSE
    RAISE NOTICE 'requested_by_contact_id column already exists';
  END IF;

  -- Add assigned_to_user_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'next_steps'
      AND column_name = 'assigned_to_user_id'
  ) THEN
    ALTER TABLE public.next_steps
    ADD COLUMN assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added assigned_to_user_id column';
  ELSE
    RAISE NOTICE 'assigned_to_user_id column already exists';
  END IF;

  -- Add priority
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'next_steps'
      AND column_name = 'priority'
  ) THEN
    ALTER TABLE public.next_steps
    ADD COLUMN priority task_priority DEFAULT 'medium' NOT NULL;
    RAISE NOTICE 'Added priority column';
  ELSE
    RAISE NOTICE 'priority column already exists';
  END IF;

  -- Handle status column - check if it exists and what type it is
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'next_steps'
      AND column_name = 'status'
  ) THEN
    -- Add as nullable first
    ALTER TABLE public.next_steps
    ADD COLUMN status task_status;
    RAISE NOTICE 'Added status column (nullable)';
  ELSE
    -- Status column exists - check if it's TEXT and needs conversion
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'next_steps'
        AND column_name = 'status'
        AND data_type = 'text'
    ) THEN
      -- Convert TEXT status to enum by creating a temporary column
      ALTER TABLE public.next_steps
      ADD COLUMN status_new task_status;
      
      -- Map existing TEXT values to enum
      UPDATE public.next_steps
      SET status_new = CASE
        WHEN status::text = 'pending' THEN 'todo'::task_status
        WHEN status::text = 'completed' OR status::text = 'done' THEN 'done'::task_status
        WHEN status::text = 'in_progress' OR status::text = 'in progress' THEN 'in_progress'::task_status
        WHEN status::text = 'todo' THEN 'todo'::task_status
        ELSE 'todo'::task_status
      END;
      
      -- Drop old column and rename new one
      ALTER TABLE public.next_steps DROP COLUMN status;
      ALTER TABLE public.next_steps RENAME COLUMN status_new TO status;
      RAISE NOTICE 'Converted existing TEXT status column to task_status enum';
    ELSE
      RAISE NOTICE 'status column already exists (not TEXT, assuming already enum)';
    END IF;
  END IF;
END $$;

-- Step 1c: Migrate Existing Data
-- Check if completed column exists and migrate from it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'next_steps'
      AND column_name = 'completed'
  ) THEN
    -- Migrate completed boolean to status enum
    UPDATE public.next_steps
    SET status = CASE
      WHEN completed = true THEN 'done'::task_status
      WHEN completed = false THEN 'todo'::task_status
      ELSE 'todo'::task_status
    END
    WHERE status IS NULL;
    RAISE NOTICE 'Migrated from completed column to status enum';
  END IF;

  -- Set default for any NULL status values (after all migrations)
  UPDATE public.next_steps
  SET status = 'todo'::task_status
  WHERE status IS NULL;
  RAISE NOTICE 'Set default status for NULL values';
END $$;

-- Now set NOT NULL constraint and default
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'next_steps'
      AND column_name = 'status'
      AND is_nullable = 'YES'
  ) THEN
    -- First ensure all rows have a status value
    UPDATE public.next_steps
    SET status = 'todo'::task_status
    WHERE status IS NULL;
    
    -- Then alter the column
    ALTER TABLE public.next_steps
    ALTER COLUMN status SET DEFAULT 'todo'::task_status,
    ALTER COLUMN status SET NOT NULL;
    RAISE NOTICE 'Set status column to NOT NULL with default';
  END IF;
END $$;

-- Set default priority for existing records (already set by DEFAULT, but ensure consistency)
UPDATE public.next_steps
SET priority = 'medium'::task_priority
WHERE priority IS NULL;

-- Step 1d: Add Indexes
CREATE INDEX IF NOT EXISTS idx_next_steps_requested_by ON public.next_steps(requested_by_contact_id);
CREATE INDEX IF NOT EXISTS idx_next_steps_assigned_to ON public.next_steps(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_next_steps_priority ON public.next_steps(priority);
CREATE INDEX IF NOT EXISTS idx_next_steps_status ON public.next_steps(status);

-- Add comments for documentation
COMMENT ON COLUMN public.next_steps.requested_by_contact_id IS 'The customer (external contact) who requested this next step';
COMMENT ON COLUMN public.next_steps.assigned_to_user_id IS 'The internal user assigned to complete this next step';
COMMENT ON COLUMN public.next_steps.priority IS 'Priority level: high, medium, or low';
COMMENT ON COLUMN public.next_steps.status IS 'Status: todo, in_progress, or done';

