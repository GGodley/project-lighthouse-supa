//
// ⚠️ PROMPT FOR CURSOR: Create this file at src/app/api/sync-emails/route.ts ⚠️
//
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  // 1. Get the user's session and provider token
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!session.provider_token) {
    return NextResponse.json({ error: 'Missing Google provider token. Please re-authenticate.' }, { status: 400 });
  }

  try {
    // 2. Create a new job in the database
    const { data: job, error: jobError } = await supabase
      .from('sync_jobs')
      .insert({ user_id: session.user.id, status: 'pending' })
      .select()
      .single();
    if (jobError) throw jobError;

    // 3. Asynchronously invoke the Edge Function (don't wait for it to finish)
    supabase.functions.invoke('sync-emails', {
      body: { 
        jobId: job.id, 
        provider_token: session.provider_token 
      },
    }).catch(console.error); // Log errors but don't block the response

    // 4. Immediately tell the frontend that the job has started
    return NextResponse.json({ message: 'Email sync initiated successfully.', jobId: job.id }, { status: 202 });

  } catch (error) {
    const dbError = error as { message: string };
    return NextResponse.json({ error: `Failed to start sync: ${dbError.message}` }, { status: 500 });
  }
}