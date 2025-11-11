-- Backfill profiles for existing users who don't have a profile yet
-- This migration creates profiles for any users in auth.users who don't have a corresponding profile

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  provider,
  provider_id,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    NULL
  ) as full_name,
  COALESCE(u.raw_app_meta_data->>'provider', 'google') as provider,
  COALESCE(
    u.raw_app_meta_data->>'provider_id',
    u.raw_user_meta_data->>'provider_id',
    u.email
  ) as provider_id,
  u.created_at,
  NOW() as updated_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Add comment
COMMENT ON TABLE public.profiles IS 'User profiles linked to auth.users. Profiles are automatically created via trigger when new users sign up.';

