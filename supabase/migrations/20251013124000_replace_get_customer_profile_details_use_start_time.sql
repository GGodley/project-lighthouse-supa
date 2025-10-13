-- Replace get_customer_profile_details to use start_time instead of meeting_date

CREATE OR REPLACE FUNCTION public.get_customer_profile_details(
  p_customer_id uuid,
  p_requesting_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
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

      -- Last 10 emails
      'emails', (
        SELECT COALESCE(json_agg(
          json_build_object(
            'id', e.id,
            'customer_id', e.customer_id,
            'subject', e.subject,
            'snippet', e.snippet,
            'received_at', e.received_at
          )
        ), '[]'::json)
        FROM (
          SELECT e.*
          FROM public.emails e
          WHERE e.customer_id = c.id
          ORDER BY e.received_at DESC
          LIMIT 10
        ) e
      ),

      -- Last 5 meetings using start_time
      'meetings', (
        SELECT COALESCE(json_agg(
          json_build_object(
            'google_event_id', m.google_event_id,
            'customer_id', m.customer_id,
            'title', m.title,
            'summary', m.summary,
            'start_time', m.start_time,
            'end_time', m.end_time
          )
        ), '[]'::json)
        FROM (
          SELECT m.*
          FROM public.meetings m
          WHERE m.customer_id = c.id
          ORDER BY m.start_time DESC
          LIMIT 5
        ) m
      )
    )
    FROM public.customers c
    WHERE c.id = p_customer_id AND c.user_id = p_requesting_user_id
  );
END;
$$;

ALTER FUNCTION public.get_customer_profile_details(uuid, uuid)
  SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_customer_profile_details(uuid, uuid)
  TO authenticated, anon;


