-- Update meeting attendee sync function to support company_id in meeting_attendees table
-- This function processes meeting attendees, resolves customers, and links them to companies

CREATE OR REPLACE FUNCTION sync_meeting_attendees(
  p_meeting_event_id TEXT,
  p_user_id UUID,
  p_attendee_emails TEXT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  attendee_email TEXT;
  resolved_customer_id UUID;
  resolved_company_id UUID;
  extracted_domain TEXT;
  matched_company_id UUID;
  company_name TEXT;
BEGIN
  -- Loop through each attendee email
  FOREACH attendee_email IN ARRAY p_attendee_emails
  LOOP
    -- Skip if email is invalid
    IF attendee_email IS NULL OR attendee_email = '' OR attendee_email NOT LIKE '%@%' THEN
      CONTINUE;
    END IF;

    -- Step 1: Check if customer already exists
    SELECT customer_id, company_id
    INTO resolved_customer_id, resolved_company_id
    FROM public.customers
    WHERE email = attendee_email
      AND user_id = p_user_id
    LIMIT 1;

    -- Step 2: If customer exists, we have resolved_company_id
    -- If customer doesn't exist, we need to create it (and possibly company)
    IF resolved_customer_id IS NULL THEN
      -- Extract domain from email
      extracted_domain := LOWER(SPLIT_PART(attendee_email, '@', 2));
      
      -- Step 3: Find matching company by domain
      SELECT company_id INTO matched_company_id
      FROM public.companies
      WHERE user_id = p_user_id
        AND LOWER(domain_name) = extracted_domain
      LIMIT 1;

      -- Step 4: Create company if it doesn't exist
      IF matched_company_id IS NULL THEN
        -- Generate company name from domain
        company_name := INITCAP(REPLACE(SPLIT_PART(extracted_domain, '.', 1), '-', ' '));
        
        INSERT INTO public.companies (user_id, domain_name, company_name, status)
        VALUES (p_user_id, extracted_domain, company_name, 'active')
        ON CONFLICT (user_id, domain_name) DO UPDATE
        SET company_name = EXCLUDED.company_name
        RETURNING company_id INTO matched_company_id;
      END IF;

      -- Step 5: Create customer with company_id
      INSERT INTO public.customers (user_id, email, full_name, company_id, domain_match)
      VALUES (
        p_user_id,
        attendee_email,
        SPLIT_PART(attendee_email, '@', 1), -- Use email prefix as default name
        matched_company_id,
        extracted_domain
      )
      ON CONFLICT (user_id, email) DO UPDATE
      SET company_id = COALESCE(customers.company_id, EXCLUDED.company_id),
          domain_match = COALESCE(customers.domain_match, EXCLUDED.domain_match)
      RETURNING customer_id, company_id INTO resolved_customer_id, resolved_company_id;
    END IF;

    -- Step 6: Insert into meeting_attendees with company_id
    -- CRITICAL: Now includes company_id column
    INSERT INTO public.meeting_attendees (
      meeting_event_id,
      customer_id,
      company_id,
      user_id
    )
    VALUES (
      p_meeting_event_id,
      resolved_customer_id,
      resolved_company_id,
      p_user_id
    )
    ON CONFLICT (meeting_event_id, customer_id) DO UPDATE
    SET company_id = EXCLUDED.company_id;

  END LOOP;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION sync_meeting_attendees(TEXT, UUID, TEXT[]) TO authenticated;

-- Add comment
COMMENT ON FUNCTION sync_meeting_attendees IS 
  'Syncs meeting attendees: resolves customers by email, creates companies from domains if needed, and inserts into meeting_attendees with company_id';

