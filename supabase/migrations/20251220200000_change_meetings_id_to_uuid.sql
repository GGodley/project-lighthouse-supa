-- Change meetings.id from BIGINT to UUID to match next_steps.meeting_id
-- This fixes the type mismatch that was causing operator errors

-- Step 1: Create a new UUID column for meetings
DO $$
BEGIN
  -- Add a new UUID column for the ID
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'meetings' 
      AND column_name = 'meeting_uuid_id'
  ) THEN
    ALTER TABLE public.meetings
    ADD COLUMN meeting_uuid_id UUID DEFAULT gen_random_uuid() NOT NULL;
    
    RAISE NOTICE 'Added meeting_uuid_id column';
  END IF;
END $$;

-- Step 2: Update next_steps.meeting_id to reference the new UUID column
-- First, we need to create a mapping from old BIGINT id to new UUID
DO $$
DECLARE
  meeting_record RECORD;
BEGIN
  -- Update next_steps.meeting_id to use the UUID from meetings
  -- We'll join on the old BIGINT id temporarily
  UPDATE public.next_steps ns
  SET meeting_id = (
    SELECT m.meeting_uuid_id::text
    FROM public.meetings m
    WHERE m.id::text = ns.meeting_id::text
    LIMIT 1
  )
  WHERE ns.meeting_id IS NOT NULL;
  
  RAISE NOTICE 'Updated next_steps.meeting_id to reference UUID';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not update next_steps.meeting_id: %', SQLERRM;
END $$;

-- Step 3: Change next_steps.meeting_id from BIGINT to UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'next_steps' 
      AND column_name = 'meeting_id'
      AND data_type = 'bigint'
  ) THEN
    -- Convert meeting_id to UUID (stored as text first, then converted)
    ALTER TABLE public.next_steps
    ALTER COLUMN meeting_id TYPE uuid USING meeting_id::text::uuid;
    
    RAISE NOTICE 'Changed next_steps.meeting_id from BIGINT to UUID';
  ELSIF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'next_steps' 
      AND column_name = 'meeting_id'
      AND data_type = 'uuid'
  ) THEN
    RAISE NOTICE 'next_steps.meeting_id is already UUID';
  END IF;
END $$;

-- Step 4: Make meetings.meeting_uuid_id the primary key (or at least unique)
-- Note: We're keeping the old BIGINT id for backward compatibility
DO $$
BEGIN
  -- Create unique index on meeting_uuid_id
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'meetings' 
      AND indexname = 'idx_meetings_uuid_id'
  ) THEN
    CREATE UNIQUE INDEX idx_meetings_uuid_id ON public.meetings(meeting_uuid_id);
    RAISE NOTICE 'Created unique index on meeting_uuid_id';
  END IF;
END $$;

-- Step 5: Add foreign key constraint from next_steps.meeting_id to meetings.meeting_uuid_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public'
      AND table_name = 'next_steps'
      AND constraint_name = 'next_steps_meeting_id_fkey'
  ) THEN
    ALTER TABLE public.next_steps
    ADD CONSTRAINT next_steps_meeting_id_fkey 
    FOREIGN KEY (meeting_id) 
    REFERENCES public.meetings(meeting_uuid_id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Added foreign key constraint next_steps_meeting_id_fkey';
  ELSE
    RAISE NOTICE 'Foreign key constraint next_steps_meeting_id_fkey already exists';
  END IF;
END $$;

-- Step 6: Update the get_company_page_details function to use meeting_uuid_id
DROP FUNCTION IF EXISTS get_company_page_details(uuid);

CREATE OR REPLACE FUNCTION get_company_page_details(company_id_param uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'company_details', (
      SELECT to_json(c.*)
      FROM companies c
      WHERE c.company_id = company_id_param
    ),
    'product_feedback', (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', fr.feature_id,
            'title', fr.title,
            'description', fr.customer_description,
            'urgency', fr.urgency,
            'status', COALESCE(fr.status, 'open'),
            'source', 'email',
            'source_id', NULL,
            'source_type', 'email',
            'company_id', company_id_param,
            'created_at', fr.created_at,
            'updated_at', fr.created_at
          ) ORDER BY fr.created_at DESC
        ),
        '[]'::json
      )
      FROM feature_requests fr
      JOIN threads t ON fr.thread_id = t.thread_id
      JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
      WHERE tcl.company_id = company_id_param
    ),
    'interaction_timeline', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'interaction_type', interaction_type,
          'interaction_date', interaction_date,
          'id', id,
          'title', title,
          'summary', summary,
          'sentiment', sentiment
        ) ORDER BY interaction_date DESC
      ), '[]'::json)
      FROM (
        -- Thread-based email interactions
        SELECT 
          'email'::text as interaction_type,
          t.last_message_date as interaction_date,
          t.thread_id as id,
          COALESCE(t.subject, 'No Subject') as title,
          CASE 
            WHEN t.llm_summary IS NOT NULL AND t.llm_summary::text ~ '^\s*\{.*\}\s*$' THEN 
              COALESCE((t.llm_summary)->>'timeline_summary', (t.llm_summary)->>'problem_statement', t.snippet, 'No summary available.')
            ELSE 
              COALESCE(t.snippet, 'No summary available.')
          END as summary,
          CASE 
            WHEN t.llm_summary IS NOT NULL AND t.llm_summary::text ~ '^\s*\{.*\}\s*$' THEN 
              COALESCE((t.llm_summary)->>'customer_sentiment', 'Neutral')
            ELSE 'Neutral'
          END as sentiment
        FROM threads t
        JOIN thread_company_link tcl ON t.thread_id = tcl.thread_id
        WHERE tcl.company_id = company_id_param
          AND t.last_message_date IS NOT NULL
        
        UNION ALL
        
        -- Meetings interactions
        SELECT 
          'meeting'::text as interaction_type,
          m.start_time as interaction_date,
          m.google_event_id as id,
          m.title,
          CASE 
            WHEN m.summary IS NOT NULL AND m.summary::text ~ '^\s*\{.*\}\s*$' THEN 
              COALESCE((m.summary::jsonb)->>'timeline_summary', (m.summary::jsonb)->>'problem_statement', 'Meeting')
            ELSE 
              COALESCE(m.title, 'Meeting')
          END as summary,
          'Neutral' as sentiment
        FROM meetings m
        JOIN customers c ON m.customer_id = c.customer_id
        WHERE c.company_id = company_id_param
          AND m.start_time IS NOT NULL
      ) combined_interactions
    ),
    'next_steps', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', ns.step_id,
          'text', ns.description,
          'status', ns.status::text,
          'owner', ns.owner,
          'due_date', ns.due_date,
          'source_type', CASE 
            WHEN ns.thread_id IS NOT NULL THEN 'thread'
            WHEN ns.meeting_id IS NOT NULL THEN 'meeting'
            ELSE NULL
          END,
          'source_id', CASE
            WHEN ns.thread_id IS NOT NULL THEN ns.thread_id
            WHEN ns.meeting_id IS NOT NULL THEN (
              SELECT m.google_event_id 
              FROM meetings m
              WHERE m.meeting_uuid_id = ns.meeting_id
              LIMIT 1
            )
            ELSE NULL
          END,
          'created_at', ns.created_at
        ) ORDER BY 
          CASE ns.status
            WHEN 'todo' THEN 1
            WHEN 'in_progress' THEN 2
            WHEN 'done' THEN 3
            ELSE 4
          END,
          ns.created_at DESC
      ), '[]'::json)
      FROM next_steps ns
      WHERE (
        -- Link next_steps to company via thread_company_link
        (ns.thread_id IS NOT NULL AND EXISTS (
          SELECT 1 
          FROM thread_company_link tcl
          WHERE tcl.thread_id = ns.thread_id
            AND tcl.company_id = company_id_param
        ))
        OR
        -- Link next_steps to company via meetings -> customers -> companies
        (ns.meeting_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM meetings m
          JOIN customers c ON m.customer_id = c.customer_id
          WHERE m.meeting_uuid_id = ns.meeting_id
            AND c.company_id = company_id_param
        ))
      )
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_company_page_details(uuid) TO authenticated;

