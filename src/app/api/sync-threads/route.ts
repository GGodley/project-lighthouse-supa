import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * API route to trigger the ingest-threads Trigger.dev job
 * This replaces the old sync-emails Edge Function approach
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
  if (!userId) {
    return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
  }

  try {
    // 2. Get Trigger.dev API credentials
    const triggerApiKey = process.env.TRIGGER_API_KEY;
    const triggerProjectId = process.env.TRIGGER_PROJECT_ID;

    if (!triggerApiKey) {
      console.error('Missing TRIGGER_API_KEY environment variable');
      return NextResponse.json(
        { error: 'Server configuration error: TRIGGER_API_KEY not set' },
        { status: 500 }
      );
    }

    // 3. Create a sync_jobs entry for tracking (for backward compatibility with UI)
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({ 
        user_id: userId, 
        status: 'pending',
        details: 'Triggering ingest-threads job via Trigger.dev'
      })
      .select()
      .single();
    
    if (jobError) {
      console.error('Error creating sync_job:', jobError);
      // Continue anyway - the Trigger.dev job will still run
    }

    // 4. Trigger the ingest-threads Trigger.dev job
    const triggerUrl = `https://api.trigger.dev/api/v1/tasks/ingest-threads/trigger`;
    
    const triggerPayload = {
      payload: {
        userId: userId,
      },
      concurrencyKey: userId, // Ensures only one job per user
    };

    console.log(`Triggering ingest-threads task for user ${userId}`);

    const triggerResponse = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${triggerApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(triggerPayload),
    });

    if (!triggerResponse.ok) {
      const errorText = await triggerResponse.text();
      console.error(`Failed to trigger ingest-threads job: ${triggerResponse.status} - ${errorText}`);
      
      // Update job status to failed if we created one
      if (job) {
        await supabase
          .from('sync_jobs')
          .update({ 
            status: 'failed',
            details: `Failed to trigger Trigger.dev job: ${errorText}`
          })
          .eq('id', job.id);
      }

      return NextResponse.json(
        { 
          error: 'Failed to trigger sync job',
          details: errorText 
        },
        { status: triggerResponse.status }
      );
    }

    const triggerResult = await triggerResponse.json();
    console.log('Successfully triggered ingest-threads job:', triggerResult);

    // 5. Update job status to running if we created one
    if (job) {
      await supabase
        .from('sync_jobs')
        .update({ 
          status: 'running',
          details: 'Ingest-threads job triggered successfully'
        })
        .eq('id', job.id);
    }

    // 6. Return success response
    return NextResponse.json(
      { 
        message: 'Thread sync initiated successfully via Trigger.dev',
        jobId: job?.id || null,
        triggerId: triggerResult.id || null
      },
      { status: 202 }
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

