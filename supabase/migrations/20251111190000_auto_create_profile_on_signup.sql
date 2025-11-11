-- Create function to automatically create a profile when a new user signs up
-- This function is called by a trigger on auth.users AFTER INSERT

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider TEXT;
  v_provider_id TEXT;
  v_email TEXT;
  v_full_name TEXT;
BEGIN
  -- Extract provider from app_metadata (e.g., 'google' or 'microsoft')
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'google');
  
  -- Extract provider_id from app_metadata or use email as fallback
  v_provider_id := COALESCE(
    NEW.raw_app_meta_data->>'provider_id',
    NEW.raw_user_meta_data->>'provider_id',
    NEW.email
  );
  
  -- Get email from auth.users
  v_email := NEW.email;
  
  -- Get full_name from user_metadata if available
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NULL
  );
  
  -- Insert profile record
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    provider,
    provider_id,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    v_email,
    v_full_name,
    v_provider,
    v_provider_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING; -- Prevent errors if profile already exists
  
  RETURN NEW;
END;
$$;

-- Add comment to function
COMMENT ON FUNCTION public.handle_new_user() IS 
'Automatically creates a profile record when a new user is inserted into auth.users. Extracts email, provider, and other metadata from the auth.users record.';

-- Create trigger on auth.users to call handle_new_user() after insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Add comment to trigger
COMMENT ON TRIGGER on_auth_user_created ON auth.users IS 
'Trigger that automatically creates a profile record in public.profiles when a new user signs up.';

