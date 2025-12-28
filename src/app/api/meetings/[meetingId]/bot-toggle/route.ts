import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ meetingId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { meetingId } = await context.params
    const body = await request.json()
    const { bot_enabled } = body

    if (typeof bot_enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'bot_enabled must be a boolean' },
        { status: 400 }
      )
    }

    // Validate user owns the meeting (security check)
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, user_id, recall_bot_id')
      .eq('id', meetingId)
      .eq('user_id', user.id)
      .single()

    if (meetingError || !meeting) {
      return NextResponse.json(
        { error: 'Meeting not found or access denied' },
        { status: 404 }
      )
    }

    // Update bot_enabled status
    const { data: updatedMeeting, error: updateError } = await supabase
      .from('meetings')
      .update({ bot_enabled })
      .eq('id', meetingId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating meeting:', updateError)
      return NextResponse.json(
        { error: 'Failed to update meeting' },
        { status: 500 }
      )
    }

    // If disabling bot and bot exists, we could optionally delete it
    // For now, we'll leave the bot (user disabled future meetings)
    // The bot will still join, but user has disabled it for future syncs

    return NextResponse.json({ meeting: updatedMeeting })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

