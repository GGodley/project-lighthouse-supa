/**
 * Utility functions for handling missing refresh tokens
 * 
 * When a provider_token is missing from a session, it typically indicates
 * that the refresh token is missing or expired. This utility provides
 * functions to detect and handle this scenario by triggering re-authentication
 * with consent to obtain a new refresh token.
 */

import { getAuthCallbackURL } from '@/lib/utils'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Checks if a session is missing a provider_token (indicates missing refresh token)
 */
export function isMissingRefreshToken(session: { provider_token?: string | null } | null): boolean {
  return !session || !session.provider_token
}

/**
 * Triggers Google OAuth re-authentication with consent to obtain a new refresh token
 * This should be called when provider_token is missing from the session
 * 
 * @param supabase - Supabase client instance
 * @param returnUrl - Optional URL to redirect to after authentication
 * @param scopes - Optional custom scopes (defaults to Gmail and Calendar)
 */
export async function triggerReAuthWithConsent(
  supabase: SupabaseClient,
  returnUrl?: string,
  scopes: string = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly'
): Promise<void> {
  const callbackUrl = getAuthCallbackURL(returnUrl)

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
      scopes: scopes,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent' // Force consent to get refresh token
      }
    }
  })

  if (error) {
    console.error('Error triggering re-authentication with consent:', error)
    throw error
  }
}

/**
 * Checks session and triggers re-auth if provider_token is missing
 * This is a convenience function that combines checking and re-authenticating
 * 
 * @param supabase - Supabase client instance
 * @param returnUrl - Optional URL to redirect to after authentication
 * @param scopes - Optional custom scopes
 * @returns true if re-auth was triggered, false if session is valid
 */
export async function ensureRefreshToken(
  supabase: SupabaseClient,
  returnUrl?: string,
  scopes?: string
): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (isMissingRefreshToken(session)) {
    await triggerReAuthWithConsent(supabase, returnUrl, scopes)
    return true // Re-auth was triggered
  }
  
  return false // Session is valid, no re-auth needed
}

