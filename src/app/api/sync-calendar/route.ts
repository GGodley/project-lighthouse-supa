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

    // Get the session to extract the access token
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      )
    }

    // Call the sync-calendar Edge Function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-calendar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!syncResponse.ok) {
      const errorData = await syncResponse.json()
      console.error('Sync calendar error:', errorData)
      return NextResponse.json(
        { error: errorData.error || 'Failed to sync calendar' },
        { status: syncResponse.status }
      )
    }

    const result = await syncResponse.json()
    return NextResponse.json(result)

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
