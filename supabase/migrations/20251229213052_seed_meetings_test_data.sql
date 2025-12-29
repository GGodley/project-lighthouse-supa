-- Seed test data for Meetings Widget
-- Inserts 5 mock meetings: 3 future, 2 past
-- Uses the current authenticated user's ID or a test pattern

-- This function inserts test meetings for the current user
-- Can be re-run safely (won't create duplicates if titles are unique)

DO $$
DECLARE
  current_user_id UUID;
  meeting_count INTEGER;
BEGIN
  -- Get the current authenticated user ID
  -- If running as service role, use a test pattern
  current_user_id := auth.uid();
  
  -- If no user is authenticated (e.g., running as service role), 
  -- we'll insert with a placeholder that can be updated
  IF current_user_id IS NULL THEN
    -- Try to get the first user from auth.users as a fallback
    SELECT id INTO current_user_id 
    FROM auth.users 
    ORDER BY created_at 
    LIMIT 1;
  END IF;
  
  -- Only proceed if we have a user_id
  IF current_user_id IS NOT NULL THEN
    -- Check if test meetings already exist for this user
    SELECT COUNT(*) INTO meeting_count
    FROM public.meetings
    WHERE user_id = current_user_id
      AND title IN (
        'Q1 Planning Session',
        'Product Demo with Acme Corp',
        'Team Standup',
        'Customer Feedback Review',
        'Sprint Retrospective'
      );
    
    -- Only insert if we don't already have test data
    IF meeting_count = 0 THEN
      -- Insert 3 future meetings
      INSERT INTO public.meetings (user_id, title, start_time, end_time, meeting_url)
      VALUES
        -- Meeting 1: Tomorrow, 30 minutes
        (
          current_user_id,
          'Q1 Planning Session',
          NOW() + INTERVAL '1 day' + INTERVAL '9 hours', -- Tomorrow at 9 AM
          NOW() + INTERVAL '1 day' + INTERVAL '9 hours 30 minutes',
          'https://meet.google.com/abc-defg-hij'
        ),
        -- Meeting 2: 3 days from now, 60 minutes
        (
          current_user_id,
          'Product Demo with Acme Corp',
          NOW() + INTERVAL '3 days' + INTERVAL '14 hours', -- 3 days from now at 2 PM
          NOW() + INTERVAL '3 days' + INTERVAL '15 hours',
          'https://zoom.us/j/123456789'
        ),
        -- Meeting 3: 5 days from now, 15 minutes
        (
          current_user_id,
          'Team Standup',
          NOW() + INTERVAL '5 days' + INTERVAL '10 hours', -- 5 days from now at 10 AM
          NOW() + INTERVAL '5 days' + INTERVAL '10 hours 15 minutes',
          NULL -- No meeting URL
        );
      
      -- Insert 2 past meetings
      INSERT INTO public.meetings (user_id, title, start_time, end_time, meeting_url)
      VALUES
        -- Meeting 4: 2 days ago, 45 minutes
        (
          current_user_id,
          'Customer Feedback Review',
          NOW() - INTERVAL '2 days' + INTERVAL '11 hours', -- 2 days ago at 11 AM
          NOW() - INTERVAL '2 days' + INTERVAL '11 hours 45 minutes',
          'https://meet.google.com/xyz-uvwx-rst'
        ),
        -- Meeting 5: 7 days ago, 30 minutes
        (
          current_user_id,
          'Sprint Retrospective',
          NOW() - INTERVAL '7 days' + INTERVAL '15 hours', -- 7 days ago at 3 PM
          NOW() - INTERVAL '7 days' + INTERVAL '15 hours 30 minutes',
          'https://zoom.us/j/987654321'
        );
      
      RAISE NOTICE 'Inserted 5 test meetings for user %', current_user_id;
    ELSE
      RAISE NOTICE 'Test meetings already exist for user %. Skipping insert.', current_user_id;
    END IF;
  ELSE
    RAISE NOTICE 'No user ID available. Test meetings not inserted.';
    RAISE NOTICE 'To insert test data, run this migration while authenticated or update user_id manually.';
  END IF;
END $$;

