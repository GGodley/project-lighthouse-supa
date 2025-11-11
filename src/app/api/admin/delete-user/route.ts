import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Admin API endpoint to delete a user and all associated data
 * 
 * This endpoint deletes a user from the profiles table, which triggers a database
 * trigger that automatically cascades deletion to all related data including:
 * - companies, threads, thread_messages, thread_company_link
 * - meetings, emails, domain_blocklist, next_steps, transcription_jobs
 * - customers, clients, tickets, events (via profiles ON DELETE CASCADE)
 * 
 * The cascade deletion is handled by the database trigger `trg_profile_cascade_delete`
 * which calls the function `delete_user_cascade_data()` to clean up all data from
 * tables that reference auth.users(id) directly.
 * 
 * SECURITY: This endpoint requires the service role key and should be protected
 * in production. Consider adding additional authentication/authorization.
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get the user ID from the request body or query params
    const body = await request.json().catch(() => ({}))
    const userId = body.userId || request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(userId)) {
      return NextResponse.json(
        { error: 'Invalid user ID format' },
        { status: 400 }
      )
    }

    // Get service role key from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Verify profile exists before deletion
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle()
    
    if (profileError) {
      console.error('Error checking profile:', profileError)
      return NextResponse.json(
        { error: 'Failed to check profile', details: profileError.message },
        { status: 500 }
      )
    }

    if (!profileData) {
      return NextResponse.json(
        { error: 'Profile not found', details: 'No profile exists for this user ID' },
        { status: 404 }
      )
    }

    const userEmail = profileData.email

    // Delete the profile - the database trigger will handle cascade deletion
    // The trigger `trg_profile_cascade_delete` will automatically delete all related data
    // from tables that reference auth.users(id) directly, then the profile row is removed
    const { error: deleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (deleteError) {
      console.error('Error deleting profile:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete profile', details: deleteError.message },
        { status: 500 }
      )
    }

    // Verify deletion by checking if profile still exists
    const { data: verifyData } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()
    
    if (verifyData) {
      console.warn('Profile still exists after deletion attempt')
      return NextResponse.json(
        { error: 'Profile deletion may have failed - profile still exists' },
        { status: 500 }
      )
    }

    // Optional: Verify cascade deletion by checking related tables
    // This is just for confirmation - the cascade should have already happened
    const { count: profileCount } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('id', userId)

    const { count: companyCount } = await supabaseAdmin
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    return NextResponse.json({
      success: true,
      message: `User ${userEmail} (${userId}) has been deleted successfully`,
      deleted: {
        userId,
        email: userEmail,
        profileDeleted: profileCount === 0,
        companiesDeleted: companyCount === 0
      }
    })

  } catch (error) {
    console.error('Unexpected error in delete-user endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to check what data exists for a user before deletion
 * Useful for previewing what will be deleted
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required as query parameter' },
        { status: 400 }
      )
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(userId)) {
      return NextResponse.json(
        { error: 'Invalid user ID format' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get user info
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
    
    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: 'User not found', details: userError?.message },
        { status: 404 }
      )
    }

    // Count related data
    const [
      { count: profileCount },
      { count: companyCount },
      { count: threadCount },
      { count: threadMessageCount },
      { count: meetingCount },
      { count: emailCount },
      { count: customerCount },
      { count: blocklistCount },
      { count: nextStepsCount },
      { count: transcriptionJobCount }
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('id', userId),
      supabaseAdmin.from('companies').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('threads').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('thread_messages').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('meetings').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('emails').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('customers').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('domain_blocklist').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('next_steps').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('transcription_jobs').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    ])

    return NextResponse.json({
      user: {
        id: userData.user.id,
        email: userData.user.email,
        createdAt: userData.user.created_at
      },
      dataCounts: {
        profiles: profileCount || 0,
        companies: companyCount || 0,
        threads: threadCount || 0,
        threadMessages: threadMessageCount || 0,
        meetings: meetingCount || 0,
        emails: emailCount || 0,
        customers: customerCount || 0,
        blocklistEntries: blocklistCount || 0,
        nextSteps: nextStepsCount || 0,
        transcriptionJobs: transcriptionJobCount || 0
      },
      totalRecords: (profileCount || 0) + (companyCount || 0) + (threadCount || 0) + 
                    (threadMessageCount || 0) + (meetingCount || 0) + (emailCount || 0) + 
                    (customerCount || 0) + (blocklistCount || 0) + (nextStepsCount || 0) + 
                    (transcriptionJobCount || 0)
    })

  } catch (error) {
    console.error('Unexpected error in delete-user GET endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

