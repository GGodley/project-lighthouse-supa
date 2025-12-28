import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    // Create Supabase client for server-side authentication
    const supabase = await createClient()

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Trigger Trigger.dev sync-calendar task
    const triggerApiKey = process.env.TRIGGER_API_KEY;
    if (!triggerApiKey) {
      return NextResponse.json(
        { error: 'TRIGGER_API_KEY not configured' },
        { status: 500 }
      );
    }

    const triggerUrl = `https://api.trigger.dev/api/v1/tasks/sync-calendar/trigger`;
    const triggerPayload = {
      payload: { userId: user.id },
      concurrencyKey: user.id,
    };

    // Fire and forget - don't wait for response
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
      console.error('Failed to trigger sync-calendar task:', errorText);
      return NextResponse.json(
        { error: 'Failed to trigger calendar sync' },
        { status: triggerResponse.status }
      );
    }

    const triggerResult = await triggerResponse.json();

    // Return success immediately (processing happens in background)
    return NextResponse.json(
      { 
        message: 'Calendar sync initiated successfully',
        runId: triggerResult.id || null,
      },
      { status: 202 } // Accepted - processing asynchronously
    );

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
