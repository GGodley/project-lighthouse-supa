-- Gmail Sync Engine Schema Migration
-- This migration:
-- 1. Creates user_sync_states table to track sync status and pagination for each user
-- 2. Adds history_id column to threads table for Gmail history tracking
-- 3. Creates indexes for performance

-- Step 1: Create user_sync_states table
CREATE TABLE IF NOT EXISTS public.user_sync_states (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'syncing', 'failed')),
  next_page_token TEXT,
  last_synced_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE public.user_sync_states IS 'Tracks Gmail sync status and pagination state for each user';
COMMENT ON COLUMN public.user_sync_states.user_id IS 'References auth.users(id), primary key';
COMMENT ON COLUMN public.user_sync_states.status IS 'Sync status: idle, syncing, or failed';
COMMENT ON COLUMN public.user_sync_states.next_page_token IS 'Gmail nextPageToken for resuming paginated sync';
COMMENT ON COLUMN public.user_sync_states.last_synced_at IS 'Watermark timestamp for q=after:X queries';
COMMENT ON COLUMN public.user_sync_states.lock_expires_at IS 'Timestamp for atomic locking mechanism';
COMMENT ON COLUMN public.user_sync_states.updated_at IS 'Last update timestamp, auto-updated';

-- Create index on status for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_sync_states_status ON public.user_sync_states(status);

-- Create index on lock_expires_at for lock cleanup queries
CREATE INDEX IF NOT EXISTS idx_user_sync_states_lock_expires_at ON public.user_sync_states(lock_expires_at);

-- Step 2: Add history_id column to threads table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'threads'
      AND column_name = 'history_id'
  ) THEN
    ALTER TABLE public.threads
    ADD COLUMN history_id BIGINT;
    
    RAISE NOTICE 'Added history_id column to threads table';
  ELSE
    RAISE NOTICE 'history_id column already exists in threads table';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN public.threads.history_id IS 'Gmail history ID (unsigned 64-bit integer) for version comparison and incremental sync';

-- Step 3: Create index on threads(history_id) for fast version comparisons
CREATE INDEX IF NOT EXISTS idx_threads_history_id ON public.threads(history_id);

-- Enable Row Level Security for user_sync_states (if not already enabled)
ALTER TABLE public.user_sync_states ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_sync_states
DO $$
BEGIN
  -- Check if policy already exists before creating
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sync_states'
      AND policyname = 'Users can view their own sync state'
  ) THEN
    CREATE POLICY "Users can view their own sync state" ON public.user_sync_states
      FOR SELECT USING (auth.uid() = user_id);
    RAISE NOTICE 'Created SELECT policy for user_sync_states';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sync_states'
      AND policyname = 'Users can insert their own sync state'
  ) THEN
    CREATE POLICY "Users can insert their own sync state" ON public.user_sync_states
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    RAISE NOTICE 'Created INSERT policy for user_sync_states';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sync_states'
      AND policyname = 'Users can update their own sync state'
  ) THEN
    CREATE POLICY "Users can update their own sync state" ON public.user_sync_states
      FOR UPDATE USING (auth.uid() = user_id);
    RAISE NOTICE 'Created UPDATE policy for user_sync_states';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sync_states'
      AND policyname = 'Users can delete their own sync state'
  ) THEN
    CREATE POLICY "Users can delete their own sync state" ON public.user_sync_states
      FOR DELETE USING (auth.uid() = user_id);
    RAISE NOTICE 'Created DELETE policy for user_sync_states';
  END IF;
END $$;

-- Step 4: Create atomic locking functions for sync engine

-- Function: claim_sync_lock
-- Atomically checks if a user can sync, and if so, locks them
-- Returns TRUE if lock was successfully claimed, FALSE if user was already busy
CREATE OR REPLACE FUNCTION public.claim_sync_lock(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  -- Attempt to INSERT a new row with syncing status
  -- ON CONFLICT, update only if we can claim the lock
  INSERT INTO public.user_sync_states (
    user_id,
    status,
    lock_expires_at,
    updated_at
  )
  VALUES (
    p_user_id,
    'syncing',
    NOW() + INTERVAL '5 minutes',
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    status = 'syncing',
    lock_expires_at = NOW() + INTERVAL '5 minutes',
    updated_at = NOW()
  WHERE
    -- Only update if current status allows locking
    (
      user_sync_states.status = 'idle' OR
      user_sync_states.status = 'failed' OR
      user_sync_states.lock_expires_at < NOW()
    );
  
  -- Check if any rows were affected (either inserted or updated)
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  
  -- If rows were inserted or updated, lock was claimed
  -- If conflict occurred but WHERE condition was false, no rows were updated
  RETURN v_rows_updated > 0;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.claim_sync_lock(UUID) IS 'Atomically claims a sync lock for a user. Returns TRUE if lock was claimed, FALSE if user is already syncing. Handles crashed syncs by checking lock_expires_at.';

-- Function: release_sync_lock
-- Updates the sync state after a batch or job finishes
-- Can extend the lock (status='syncing') or release it (status='idle'/'failed')
CREATE OR REPLACE FUNCTION public.release_sync_lock(
  p_user_id UUID,
  p_status TEXT,
  p_next_page_token TEXT DEFAULT NULL,
  p_last_synced_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate status parameter
  IF p_status NOT IN ('idle', 'syncing', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of: idle, syncing, failed', p_status;
  END IF;
  
  -- Update user_sync_states
  UPDATE public.user_sync_states
  SET
    status = p_status,
    next_page_token = p_next_page_token,
    last_synced_at = COALESCE(p_last_synced_at, last_synced_at),
    -- If status is 'syncing', extend the lock
    -- If status is 'idle' or 'failed', clear the lock
    lock_expires_at = CASE
      WHEN p_status = 'syncing' THEN NOW() + INTERVAL '5 minutes'
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- If no rows were updated, the user_sync_states row doesn't exist
  -- This shouldn't happen if claim_sync_lock was called first, but handle gracefully
  IF NOT FOUND THEN
    RAISE WARNING 'No sync state found for user_id: %. Lock may not have been claimed first.', p_user_id;
  END IF;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.release_sync_lock(UUID, TEXT, TEXT, TIMESTAMPTZ) IS 'Updates sync state after a batch completes. If status is syncing, extends lock. If idle/failed, releases lock. Optionally updates next_page_token and last_synced_at.';

-- Step 5: Create smart upsert function for differential sync

-- Function: upsert_threads_batch
-- Efficiently processes a batch of threads from Gmail, only updating if history_id is newer
-- Returns the thread_ids that were actually inserted or updated (for triggering AI analysis)
-- 
-- Expected JSONB format:
-- [
--   {
--     "id": "thread_id_string",
--     "history_id": 123,  (or "historyId" from Gmail API)
--     "snippet": "email snippet",
--     "subject": "email subject",
--     "internal_date": "1234567890000"  (milliseconds since epoch, optional)
--   }
-- ]
CREATE OR REPLACE FUNCTION public.upsert_threads_batch(
  p_user_id UUID,
  p_threads JSONB
)
RETURNS TABLE(thread_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Use a CTE to parse the JSONB array and perform the upsert
  -- Only update if EXCLUDED.history_id > existing history_id (or existing is NULL)
  RETURN QUERY
  WITH parsed_threads AS (
    SELECT
      (thread->>'id')::TEXT AS thread_id,
      -- Handle both "history_id" and "historyId" (Gmail API uses camelCase)
      COALESCE(
        (thread->>'history_id')::BIGINT,
        (thread->>'historyId')::BIGINT
      ) AS history_id,
      thread->>'snippet' AS snippet,
      thread->>'subject' AS subject,
      -- Parse internal_date: Gmail uses milliseconds since epoch
      -- Can be provided as string or number, in snake_case or camelCase
      CASE
        WHEN thread->>'internal_date' IS NOT NULL THEN
          to_timestamp((thread->>'internal_date')::BIGINT / 1000)
        WHEN thread->>'internalDate' IS NOT NULL THEN
          to_timestamp((thread->>'internalDate')::BIGINT / 1000)
        WHEN jsonb_typeof(thread->'internal_date') = 'number' THEN
          to_timestamp((thread->'internal_date')::BIGINT / 1000)
        WHEN jsonb_typeof(thread->'internalDate') = 'number' THEN
          to_timestamp((thread->'internalDate')::BIGINT / 1000)
        ELSE NULL
      END AS internal_date
    FROM jsonb_array_elements(p_threads) AS thread
    WHERE thread->>'id' IS NOT NULL  -- Skip invalid entries
  ),
  upserted AS (
    INSERT INTO public.threads (
      thread_id,
      user_id,
      history_id,
      snippet,
      subject,
      last_message_date
    )
    SELECT
      pt.thread_id,
      p_user_id,
      pt.history_id,
      pt.snippet,
      pt.subject,
      pt.internal_date
    FROM parsed_threads pt
    ON CONFLICT (thread_id) DO UPDATE
    SET
      -- Only update history_id if new one is greater (or existing is NULL)
      history_id = CASE
        WHEN threads.history_id IS NULL THEN EXCLUDED.history_id
        WHEN EXCLUDED.history_id IS NOT NULL AND EXCLUDED.history_id > threads.history_id 
        THEN EXCLUDED.history_id
        ELSE threads.history_id
      END,
      snippet = EXCLUDED.snippet,
      subject = COALESCE(EXCLUDED.subject, threads.subject),
      last_message_date = COALESCE(EXCLUDED.last_message_date, threads.last_message_date)
    WHERE
      -- Only perform update if the new history_id is greater than existing (or existing is NULL)
      -- This ensures we only process threads that have actually changed
      (threads.history_id IS NULL OR 
       (EXCLUDED.history_id IS NOT NULL AND EXCLUDED.history_id > threads.history_id))
    RETURNING threads.thread_id
  )
  SELECT upserted.thread_id FROM upserted;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.upsert_threads_batch(UUID, JSONB) IS 'Smart upsert for Gmail threads. Only updates if new history_id is greater than existing. Returns thread_ids that were inserted or updated. Handles internal_date conversion from milliseconds to timestamp.';

