-- Create google_tokens table for storing Google access tokens
-- This table uses default deny RLS (no client policies) to ensure tokens are never accessible to clients
-- Service role key bypasses RLS automatically, so edge functions can access tokens

CREATE TABLE IF NOT EXISTS public.google_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (default deny - no client policies means clients cannot access)
ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_google_tokens_user_id ON public.google_tokens(user_id);

-- Add updated_at trigger (reuse existing function)
DROP TRIGGER IF EXISTS trg_google_tokens_updated_at ON public.google_tokens;
CREATE TRIGGER trg_google_tokens_updated_at
BEFORE UPDATE ON public.google_tokens
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add comments for documentation
COMMENT ON TABLE public.google_tokens IS 'Stores Google access tokens for users. Default deny RLS ensures tokens are never accessible to clients. Service role key bypasses RLS.';
COMMENT ON COLUMN public.google_tokens.user_id IS 'User ID (primary key, references auth.users)';
COMMENT ON COLUMN public.google_tokens.access_token IS 'Google OAuth access token';
COMMENT ON COLUMN public.google_tokens.expires_at IS 'Token expiration timestamp (optional, can be NULL)';
COMMENT ON COLUMN public.google_tokens.updated_at IS 'Last update timestamp';

