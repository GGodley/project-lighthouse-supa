-- Fix get_customer_profile_details function to match the ACTUAL customers table schema
CREATE OR REPLACE FUNCTION get_customer_profile_details(
  p_customer_id uuid,
  p_requesting_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT
      json_build_object(
        'id', c.id,
        'name', c.name,
        'contact_email', c.contact_email,
        'company_name', c.company_name,
        'health_score', c.health_score,
        'status', c.status,
        'mrr', c.mrr,
        'renewal_date', c.renewal_date,
        'last_interaction_at', c.last_interaction_at,
        'overall_sentiment', c.overall_sentiment,
        'email', c.email,
        'created_at', c.created_at,
        'user_id', c.user_id,
        
        -- Aggregate all interactions (emails and meetings) into a single JSON array
        'allInteractions', (
          SELECT COALESCE(json_agg(interactions.* ORDER BY interaction_date DESC), '[]'::json)
          FROM (
            -- Get all emails for the customer
            SELECT
              e.id::text AS interaction_id,
              'Email' AS interaction_type,
              e.received_at AS interaction_date,
              COALESCE(e.summary, e.snippet, e.subject) AS summary,
              COALESCE(e.sentiment, 'Neutral') AS sentiment,
              '{}'::text[] AS topics,
              e.next_steps,
              e.outstanding_issues
            FROM public.emails e
            WHERE e.customer_id = c.id
            
            UNION ALL
            
            -- Get all meetings for the customer - using start_time instead of start_date
            SELECT
              m.id::text AS interaction_id,
              'Call' AS interaction_type,
              m.start_time AS interaction_date,
              m.summary,
              COALESCE(m.sentiment, 'Neutral') AS sentiment,
              -- Convert jsonb arrays of objects to simple text arrays
              (SELECT array_agg(value) FROM jsonb_array_elements_text(m.topics)) AS topics,
              -- Use the new next_steps and outstanding_issues columns
              (SELECT array_agg(value) FROM jsonb_array_elements_text(m.next_steps)) AS next_steps,
              (SELECT array_agg(value) FROM jsonb_array_elements_text(m.outstanding_issues)) AS outstanding_issues
            FROM public.meetings m
            WHERE m.customer_id = c.id

          ) AS interactions
        ),
        
        -- Aggregate all feature requests for the customer
        'featureRequests', (
          SELECT COALESCE(json_agg(fr_details), '[]'::json)
          FROM (
            SELECT
              fr.urgency,
              json_build_object(
                'title', f.title
              ) AS features
            FROM public.feature_requests fr
            JOIN public.features f ON fr.feature_id = f.id
            WHERE fr.customer_id = c.id
          ) AS fr_details
        )
      )
    FROM
      public.customers c
    WHERE
      c.id = p_customer_id AND c.user_id = p_requesting_user_id
  );
END;
$$;

