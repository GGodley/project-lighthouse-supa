import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { deleteBotFromRecall, createBotInRecall } from '@/trigger/_shared/bot-utils'
import { calculateJoinTime } from '@/trigger/_shared/timezone-utils'

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

    // Validate user owns the meeting and fetch meeting details
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, user_id, recall_bot_id, meeting_url, hangout_link, start_time')
      .eq('id', meetingId)
      .eq('user_id', user.id)
      .single()

    if (meetingError || !meeting) {
      return NextResponse.json(
        { error: 'Meeting not found or access denied' },
        { status: 404 }
      )
    }

    const recallApiKey = process.env.RECALLAI_API_KEY
    if (!recallApiKey) {
      return NextResponse.json(
        { error: 'Recall.ai API key not configured' },
        { status: 500 }
      )
    }

    // Handle bot cancellation (disabling)
    if (!bot_enabled && meeting.recall_bot_id) {
      console.log(`[BOT-TOGGLE] Cancelling bot ${meeting.recall_bot_id} for meeting ${meetingId}`)
      const deleteResult = await deleteBotFromRecall(meeting.recall_bot_id, recallApiKey)
      
      if (!deleteResult.success) {
        console.error(`[BOT-TOGGLE] Failed to cancel bot: ${deleteResult.error}`)
        // Return error if deletion fails (unless it's a 404 which means already deleted)
        if (deleteResult.statusCode !== 404) {
          return NextResponse.json(
            { error: `Failed to delete bot from Recall.ai: ${deleteResult.error}` },
            { status: 500 }
          )
        }
        // 404 is fine - bot was already deleted
        console.log(`[BOT-TOGGLE] Bot ${meeting.recall_bot_id} was already deleted (404)`)
      } else {
        console.log(`[BOT-TOGGLE] Successfully cancelled bot ${meeting.recall_bot_id}`)
      }

      // Update database: set bot_enabled to false and clear recall_bot_id
      const { data: updatedMeeting, error: updateError } = await supabase
        .from('meetings')
        .update({ 
          bot_enabled: false,
          recall_bot_id: null // Clear bot ID since we cancelled it
        })
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

      return NextResponse.json({ 
        meeting: updatedMeeting,
        bot_cancelled: deleteResult.success || deleteResult.statusCode === 404
      })
    }

    // Handle bot scheduling (enabling)
    if (bot_enabled) {
      const meetingUrl = meeting.meeting_url || meeting.hangout_link
      const startTime = meeting.start_time

      if (!meetingUrl) {
        return NextResponse.json(
          { error: 'Meeting URL is required to schedule a bot' },
          { status: 400 }
        )
      }

      if (!startTime) {
        return NextResponse.json(
          { error: 'Meeting start time is required to schedule a bot' },
          { status: 400 }
        )
      }

      // Check if meeting is in the past
      const now = new Date()
      const meetingStart = new Date(startTime)
      if (meetingStart <= now) {
        return NextResponse.json(
          { error: 'Cannot schedule bot for past meetings' },
          { status: 400 }
        )
      }

      // If bot already exists, delete it first (in case of re-enabling)
      if (meeting.recall_bot_id) {
        console.log(`[BOT-TOGGLE] Deleting existing bot ${meeting.recall_bot_id} before creating new one`)
        const deleteResult = await deleteBotFromRecall(meeting.recall_bot_id, recallApiKey)
        
        if (!deleteResult.success && deleteResult.statusCode !== 404) {
          // 404 is fine (bot already deleted), but other errors should be logged
          console.warn(`[BOT-TOGGLE] Warning: Failed to delete old bot ${meeting.recall_bot_id}: ${deleteResult.error}`)
          // Continue anyway - we'll create a new bot and update the ID
        } else {
          console.log(`[BOT-TOGGLE] Successfully deleted old bot ${meeting.recall_bot_id}`)
        }
      }

      // Create new bot on Recall.ai
      const joinAt = calculateJoinTime(startTime)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
      if (!supabaseUrl) {
        return NextResponse.json(
          { error: 'Supabase URL not configured' },
          { status: 500 }
        )
      }

      const webhookUrl = `${supabaseUrl}/functions/v1/process-transcript`
      console.log(`[BOT-TOGGLE] Creating bot for meeting ${meetingId}, join_at: ${joinAt}`)
      
      const createResult = await createBotInRecall(
        meetingUrl,
        joinAt,
        webhookUrl,
        recallApiKey
      )

      if (!createResult.success || !createResult.botId) {
        console.error(`[BOT-TOGGLE] Failed to create bot: ${createResult.error}`)
        return NextResponse.json(
          { error: `Failed to schedule bot: ${createResult.error}` },
          { status: 500 }
        )
      }

      console.log(`[BOT-TOGGLE] Successfully created bot ${createResult.botId}`)

      // Update database: set bot_enabled to true and save recall_bot_id
      const { data: updatedMeeting, error: updateError } = await supabase
        .from('meetings')
        .update({ 
          bot_enabled: true,
          recall_bot_id: createResult.botId
        })
        .eq('id', meetingId)
        .eq('user_id', user.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating meeting:', updateError)
        // Bot was created but database update failed - try to clean up bot
        await deleteBotFromRecall(createResult.botId, recallApiKey)
        return NextResponse.json(
          { error: 'Failed to update meeting after bot creation' },
          { status: 500 }
        )
      }

      return NextResponse.json({ 
        meeting: updatedMeeting,
        bot_created: true,
        bot_id: createResult.botId
      })
    }

    // If we get here, bot_enabled is false but no bot exists (already disabled)
    // Just update the database
    const { data: updatedMeeting, error: updateError } = await supabase
      .from('meetings')
      .update({ bot_enabled: false })
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

    return NextResponse.json({ meeting: updatedMeeting })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

