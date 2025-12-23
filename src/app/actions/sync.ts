'use server';

import { tasks } from '@trigger.dev/sdk/v3';

/**
 * Server Action to start Gmail sync via Trigger.dev
 * 
 * This action triggers the 'ingest-threads' Trigger.dev job which orchestrates
 * fetching Gmail threads from the Supabase Edge Function with pagination.
 * 
 * @param userId - The user ID to sync Gmail threads for
 * @returns Object with success status and trigger handle
 * @throws Error if trigger fails
 */
export async function startGmailSync(userId: string) {
  try {
    const handle = await tasks.trigger('ingest-threads', {
      payload: { userId },
    });

    return { success: true, handle };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to start Gmail sync: ${errorMessage}`);
  }
}

