-- Ensure SECURITY DEFINER function runs with stable search_path and proper privileges

-- Lock down search_path for the function to avoid 400 due to schema resolution
ALTER FUNCTION public.get_customer_profile_details(uuid, uuid)
  SET search_path = public;

-- Grant execute to authenticated users (and service role inherently has it)
GRANT EXECUTE ON FUNCTION public.get_customer_profile_details(uuid, uuid)
  TO authenticated, anon;

-- Optional: REVOKE from PUBLIC if needed (usually PUBLIC has no explicit grant)
-- REVOKE ALL ON FUNCTION public.get_customer_profile_details(uuid, uuid) FROM PUBLIC;


