import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GmailService, syncEmailsToDatabase } from '@/lib/gmail'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile with Gmail tokens
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.gmail_access_token) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
    }

    // Initialize Gmail service
    const gmailService = new GmailService(
      profile.gmail_access_token,
      profile.gmail_refresh_token || ''
    )

    // Fetch emails from Gmail
    const emails = await gmailService.getEmails(100)

    // Sync emails to database
    await syncEmailsToDatabase(supabase, user.id, emails)

    return NextResponse.json({ 
      success: true, 
      message: `Synced ${emails.length} emails` 
    })

  } catch (error) {
    console.error('Error syncing emails:', error)
    return NextResponse.json(
      { error: 'Failed to sync emails' }, 
      { status: 500 }
    )
  }
}
