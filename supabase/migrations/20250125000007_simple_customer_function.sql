-- Create a simple get_customer_profile_details function that only returns customer data
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
        'allInteractions', '[]'::json,
        'featureRequests', '[]'::json
      )
    FROM
      public.customers c
    WHERE
      c.id = p_customer_id AND c.user_id = p_requesting_user_id
  );
END;
$$;
