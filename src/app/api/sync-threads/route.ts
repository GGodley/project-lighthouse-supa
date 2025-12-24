import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SyncStatus } from '@/lib/types/sync';

/**
 * API route to trigger Gmail sync
 * 
 * Architecture:
 * 1. User triggers sync with their session (has provider_token)
 * 2. Calls Edge Function to fetch Gmail batches and store raw data
 * 3. Edge Function returns immediately (doesn't wait)
 * 4. Trigger.dev processes stored data asynchronously (no auth needed)
 */
export async function POST() {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  // 1. Get the user's session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const providerToken = session.provider_token;

  if (!userId) {
    return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
  }

  if (!providerToken) {
    return NextResponse.json({ 
      error: 'Missing Google access token',
      message: 'Please re-authenticate with Google to grant access'
    }, { status: 403 });
  }

  try {
    // 2. Create a sync_jobs entry for tracking
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({ 
        user_id: userId, 
        status: SyncStatus.RUNNING,
        details: 'Fetching Gmail batches via Edge Function'
      })
      .select()
      .single();
    
    if (jobError) {
      console.error('Error creating sync_job:', jobError);
      // Continue anyway
    }

    // 3. Call Edge Function to fetch batches (uses provider_token from session)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json(
        { error: 'Server configuration error: SUPABASE_URL not set' },
        { status: 500 }
      );
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sync-gmail-batches`;
    const edgeFunctionResponse = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      },
      body: JSON.stringify({
        provider_token: providerToken,
        userId: userId,
        maxBatches: 10, // Fetch first 10 batches (500 threads)
      }),
    });

    if (!edgeFunctionResponse.ok) {
      const errorText = await edgeFunctionResponse.text();
      console.error(`Edge function error: ${edgeFunctionResponse.status} - ${errorText}`);
      
      // Update job status to failed
      if (job) {
        await supabase
          .from('sync_jobs')
          .update({ 
            status: SyncStatus.FAILED,
            details: `Edge function error: ${errorText}`
          })
          .eq('id', job.id);
      }

      return NextResponse.json(
        { 
          error: 'Failed to fetch Gmail batches',
          details: errorText 
        },
        { status: edgeFunctionResponse.status }
      );
    }

    const functionResult = await edgeFunctionResponse.json();
    console.log('Edge function response:', functionResult);

    // 4. Trigger Trigger.dev job to process stored data (no auth needed)
    const triggerApiKey = process.env.TRIGGER_API_KEY;
    if (triggerApiKey) {
      const triggerUrl = `https://api.trigger.dev/api/v1/tasks/ingest-threads/trigger`;
      const triggerPayload = {
        payload: { userId },
        concurrencyKey: userId,
      };

      // Fire and forget - don't wait for response
      fetch(triggerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${triggerApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(triggerPayload),
      }).catch(err => {
        console.error('Failed to trigger processing job (non-critical):', err);
      });
    }

    // 5. Update job status
    if (job) {
      await supabase
        .from('sync_jobs')
        .update({ 
          status: SyncStatus.RUNNING,
          details: `Fetched ${functionResult.totalThreadsFetched || 0} threads. Processing asynchronously.`
        })
        .eq('id', job.id);
    }

    // 6. Return success immediately (fetching happens in background)
    return NextResponse.json(
      { 
        message: 'Gmail sync initiated successfully',
        jobId: job?.id || null,
        batchesFetched: functionResult.batchesFetched || 0,
        totalThreadsFetched: functionResult.totalThreadsFetched || 0,
        hasMore: !!functionResult.nextPageToken,
      },
      { status: 202 } // Accepted - processing asynchronously
    );

  } catch (error) {
    console.error('Error in sync-threads API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to start sync: ${errorMessage}` },
      { status: 500 }
    );
  }
}

