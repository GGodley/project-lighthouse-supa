-- Update meetings.next_steps from TEXT to JSONB to store structured next steps
ALTER TABLE public.meetings 
  ALTER COLUMN next_steps TYPE JSONB USING 
    CASE 
      WHEN next_steps IS NULL OR next_steps = '' THEN NULL::JSONB
      WHEN next_steps::text LIKE '[%' THEN next_steps::JSONB
      ELSE jsonb_build_array(jsonb_build_object('text', next_steps, 'owner', null, 'due_date', null))
    END;

-- Add comment
COMMENT ON COLUMN public.meetings.next_steps IS 'Structured array of next steps with text, owner, and due_date (JSONB format)';

