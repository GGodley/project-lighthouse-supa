-- Gmail Thread Hydration System Schema Migration
-- Adds columns and constraints needed for incremental thread hydration

-- Threads table additions
ALTER TABLE public.threads
ADD COLUMN IF NOT EXISTS is_ignored boolean NOT NULL DEFAULT false;

ALTER TABLE public.threads
ADD COLUMN IF NOT EXISTS ignored_reason text;

ALTER TABLE public.threads
ADD COLUMN IF NOT EXISTS last_hydrated_at timestamptz;

-- Create index for UI list performance
CREATE INDEX IF NOT EXISTS idx_threads_user_ignored_lastmsg
ON public.threads (user_id, is_ignored, last_message_date DESC);

-- Thread_messages uniqueness and index
-- Check if constraint exists before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'thread_messages_user_message_unique'
    AND conrelid = 'public.thread_messages'::regclass
  ) THEN
    ALTER TABLE public.thread_messages
    ADD CONSTRAINT thread_messages_user_message_unique
    UNIQUE (user_id, message_id);
  END IF;
END $$;

-- Create composite index for efficient querying
CREATE INDEX IF NOT EXISTS idx_thread_messages_user_thread_date
ON public.thread_messages (user_id, thread_id, sent_date);

-- Add comments for documentation
COMMENT ON COLUMN public.threads.is_ignored IS 'Whether this thread should be ignored (e.g., calendar-only or no-reply threads)';
COMMENT ON COLUMN public.threads.ignored_reason IS 'Reason why thread is ignored: calendar_only, no_reply_only, or filtered_only';
COMMENT ON COLUMN public.threads.last_hydrated_at IS 'Timestamp when thread was last hydrated with full message content';

