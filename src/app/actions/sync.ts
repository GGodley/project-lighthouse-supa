'use server';

import { tasks } from '@trigger.dev/sdk/v3';
import { createClient } from '@/utils/supabase/server';

/**
 * Server Action to start Gmail sync via Trigger.dev
 * 
 * This action triggers the 'ingest-threads' Trigger.dev job which orchestrates
 * fetching Gmail threads from the Supabase Edge Function with pagination.
 * 
 * Uses Supabase best practices - Server Action runs on server with user's session.
 * Trigger.dev handles queue management, so no database tracking needed.
 * 
 * @returns Object with success status and trigger handle
 * @throws Error("Unauthorized") if user not authenticated
 * @throws Error if trigger fails
 */
export async function startGmailSync() {
  // Initialize Supabase client using modern SSR pattern
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error } = await supabase.auth.getUser();

  // Check authentication
  if (error || !user) {
    throw new Error('Unauthorized');
  }

  // Trigger Trigger.dev job
  const handle = await tasks.trigger('ingest-threads', {
    payload: { userId: user.id },
  });

  return { success: true, handle };
}

