-- Add flat columns to threads table for analyzer service
-- This migration adds the flat schema columns that the analyzer.py service uses
-- instead of storing everything in the llm_summary JSONB column

-- Add summary column (TEXT, nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'threads'
      AND column_name = 'summary'
  ) THEN
    ALTER TABLE public.threads
    ADD COLUMN summary TEXT;
    
    RAISE NOTICE 'Added summary column to threads table';
  ELSE
    RAISE NOTICE 'summary column already exists in threads table';
  END IF;
END $$;

-- Add sentiment column (TEXT, nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'threads'
      AND column_name = 'sentiment'
  ) THEN
    ALTER TABLE public.threads
    ADD COLUMN sentiment TEXT;
    
    RAISE NOTICE 'Added sentiment column to threads table';
  ELSE
    RAISE NOTICE 'sentiment column already exists in threads table';
  END IF;
END $$;

-- Add sentiment_score column (INTEGER, nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'threads'
      AND column_name = 'sentiment_score'
  ) THEN
    ALTER TABLE public.threads
    ADD COLUMN sentiment_score INTEGER;
    
    RAISE NOTICE 'Added sentiment_score column to threads table';
  ELSE
    RAISE NOTICE 'sentiment_score column already exists in threads table';
  END IF;
END $$;

-- Add resolution_status column (TEXT, nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'threads'
      AND column_name = 'resolution_status'
  ) THEN
    ALTER TABLE public.threads
    ADD COLUMN resolution_status TEXT;
    
    RAISE NOTICE 'Added resolution_status column to threads table';
  ELSE
    RAISE NOTICE 'resolution_status column already exists in threads table';
  END IF;
END $$;

-- Add problem_statement column (TEXT, nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'threads'
      AND column_name = 'problem_statement'
  ) THEN
    ALTER TABLE public.threads
    ADD COLUMN problem_statement TEXT;
    
    RAISE NOTICE 'Added problem_statement column to threads table';
  ELSE
    RAISE NOTICE 'problem_statement column already exists in threads table';
  END IF;
END $$;

-- Add timeline_summary column (TEXT, nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'threads'
      AND column_name = 'timeline_summary'
  ) THEN
    ALTER TABLE public.threads
    ADD COLUMN timeline_summary TEXT;
    
    RAISE NOTICE 'Added timeline_summary column to threads table';
  ELSE
    RAISE NOTICE 'timeline_summary column already exists in threads table';
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.threads.summary IS 'Summary of the thread (from timeline_summary or problem_statement)';
COMMENT ON COLUMN public.threads.sentiment IS 'Customer sentiment (e.g., Very Positive, Positive, Neutral, Negative, Very Negative)';
COMMENT ON COLUMN public.threads.sentiment_score IS 'Numeric sentiment score (-2 to 2)';
COMMENT ON COLUMN public.threads.resolution_status IS 'Status of resolution (e.g., Resolved, In Progress, Pending, Unresolved)';
COMMENT ON COLUMN public.threads.problem_statement IS 'Clear statement of the problem or topic discussed';
COMMENT ON COLUMN public.threads.timeline_summary IS 'Summary of the timeline of events in the thread';



