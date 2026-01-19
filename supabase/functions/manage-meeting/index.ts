import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Manage Meeting Edge Function - Handles hiding and toggling recording for meetings
 * 
 * Actions:
 * - "hide": Hides a meeting (deletes bot if exists, sets is_hidden = true)
 * - "toggle_record": Toggles recording on/off (creates/deletes bot, updates bot_enabled)
 */
Deno.serve(async (req) => {
  try {
    console.log("[MANAGE-MEETING] Request received");

    // Validate environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const recallApiKey = Deno.env.get('RECALLAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, message: 'Supabase configuration missing' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!recallApiKey) {
      return new Response(
        JSON.stringify({ success: false, message: 'RECALLAI_API_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { action, meetingId, shouldRecord } = body;

    if (!action || !meetingId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing required fields: action and meetingId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (action !== 'hide' && action !== 'toggle_record') {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid action. Must be "hide" or "toggle_record"' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'toggle_record' && typeof shouldRecord !== 'boolean') {
      return new Response(
        JSON.stringify({ success: false, message: 'shouldRecord must be a boolean for toggle_record action' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Lookup meeting by meeting_uuid_id
    console.log(`[MANAGE-MEETING] Looking up meeting with meeting_uuid_id: ${meetingId}`);
    const { data: meeting, error: lookupError } = await supabase
      .from('meetings')
      .select('meeting_uuid_id, recall_bot_id, bot_enabled, meeting_url, title, start_time, hangout_link')
      .eq('meeting_uuid_id', meetingId)
      .single();

    if (lookupError || !meeting) {
      console.error(`[MANAGE-MEETING] Meeting not found:`, lookupError);
      return new Response(
        JSON.stringify({ success: false, message: 'Meeting not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[MANAGE-MEETING] Found meeting: ${meeting.title || 'Untitled'}, bot_enabled: ${meeting.bot_enabled}, recall_bot_id: ${meeting.recall_bot_id}`);

    // Handle "hide" action
    if (action === 'hide') {
      // Delete bot from Recall.ai if it exists
      if (meeting.recall_bot_id) {
        console.log(`[MANAGE-MEETING] Deleting bot ${meeting.recall_bot_id} from Recall.ai`);
        try {
          const deleteUrl = `https://us-west-2.recall.ai/api/v1/bot/${meeting.recall_bot_id}/`;
          const deleteResponse = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Token ${recallApiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (deleteResponse.ok || deleteResponse.status === 204 || deleteResponse.status === 404) {
            console.log(`[MANAGE-MEETING] Bot deleted successfully (status: ${deleteResponse.status})`);
          } else {
            console.warn(`[MANAGE-MEETING] Failed to delete bot: ${deleteResponse.status}`);
            // Continue anyway - we'll still hide the meeting
          }
        } catch (deleteError) {
          console.error(`[MANAGE-MEETING] Error deleting bot:`, deleteError);
          // Continue anyway - we'll still hide the meeting
        }
      }

      // Update database: set is_hidden = true
      const { error: updateError } = await supabase
        .from('meetings')
        .update({ is_hidden: true })
        .eq('meeting_uuid_id', meetingId);

      if (updateError) {
        console.error(`[MANAGE-MEETING] Failed to update meeting:`, updateError);
        return new Response(
          JSON.stringify({ success: false, message: `Failed to hide meeting: ${updateError.message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[MANAGE-MEETING] Meeting hidden successfully`);
      return new Response(
        JSON.stringify({ success: true, message: 'Meeting hidden successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Handle "toggle_record" action
    if (action === 'toggle_record') {
      // Case 1: Turning OFF recording (shouldRecord = false)
      if (!shouldRecord) {
        console.log(`[MANAGE-MEETING] Turning OFF recording for meeting ${meetingId}`);

        // Delete bot from Recall.ai if it exists
        if (meeting.recall_bot_id) {
          console.log(`[MANAGE-MEETING] Deleting bot ${meeting.recall_bot_id} from Recall.ai`);
          try {
            const deleteUrl = `https://us-west-2.recall.ai/api/v1/bot/${meeting.recall_bot_id}/`;
            const deleteResponse = await fetch(deleteUrl, {
              method: 'DELETE',
              headers: {
                Authorization: `Token ${recallApiKey}`,
                'Content-Type': 'application/json',
              },
            });

            if (deleteResponse.ok || deleteResponse.status === 204 || deleteResponse.status === 404) {
              console.log(`[MANAGE-MEETING] Bot deleted successfully (status: ${deleteResponse.status})`);
            } else {
              console.warn(`[MANAGE-MEETING] Failed to delete bot: ${deleteResponse.status}`);
              // Continue anyway
            }
          } catch (deleteError) {
            console.error(`[MANAGE-MEETING] Error deleting bot:`, deleteError);
            // Continue anyway
          }
        }

        // Update database: set bot_enabled = false, recall_bot_id = null, status = 'scheduling_in_progress'
        const { error: updateError } = await supabase
          .from('meetings')
          .update({
            bot_enabled: false,
            recall_bot_id: null,
            status: 'scheduling_in_progress',
          })
          .eq('meeting_uuid_id', meetingId);

        if (updateError) {
          console.error(`[MANAGE-MEETING] Failed to update meeting:`, updateError);
          return new Response(
            JSON.stringify({ success: false, message: `Failed to disable recording: ${updateError.message}` }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[MANAGE-MEETING] Recording disabled successfully`);
        return new Response(
          JSON.stringify({ success: true, message: 'Recording disabled successfully' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Case 2: Turning ON recording (shouldRecord = true)
      console.log(`[MANAGE-MEETING] Turning ON recording for meeting ${meetingId}`);

      // If bot already exists and is valid, do nothing
      if (meeting.recall_bot_id) {
        console.log(`[MANAGE-MEETING] Bot already exists (${meeting.recall_bot_id}), skipping creation`);
        
        // Just update bot_enabled to true in case it was false
        const { error: updateError } = await supabase
          .from('meetings')
          .update({ bot_enabled: true })
          .eq('meeting_uuid_id', meetingId);

        if (updateError) {
          console.error(`[MANAGE-MEETING] Failed to update meeting:`, updateError);
          return new Response(
            JSON.stringify({ success: false, message: `Failed to enable recording: ${updateError.message}` }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Recording already enabled' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Bot doesn't exist - create it
      const meetingUrl = meeting.meeting_url || meeting.hangout_link;
      if (!meetingUrl) {
        return new Response(
          JSON.stringify({ success: false, message: 'Meeting URL is required to enable recording' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!meeting.start_time) {
        return new Response(
          JSON.stringify({ success: false, message: 'Meeting start time is required to enable recording' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Calculate join_at (1 minute before start_time)
      const startDate = new Date(meeting.start_time);
      const joinAt = new Date(startDate.getTime() - 60000).toISOString();

      // Build webhook URL
      const webhookUrl = `${supabaseUrl}/functions/v1/process-transcript`;

      // Build recording config
      const transcriptionProvider = Deno.env.get('RECALL_TRANSCRIPTION_PROVIDER')?.trim() || 'gladia_v2_streaming';
      const recordingConfig: {
        transcript: {
          provider?: Record<string, Record<string, never>>;
          webhook_url: string;
        };
      } = {
        transcript: {
          webhook_url: webhookUrl,
          ...(transcriptionProvider && {
            provider: {
              [transcriptionProvider]: {},
            },
          }),
        },
      };

      // Create bot payload
      const recallPayload = {
        meeting_url: meetingUrl,
        join_at: joinAt,
        recording_config: recordingConfig,
      };

      console.log(`[MANAGE-MEETING] Creating bot for meeting: ${meetingUrl}, join_at: ${joinAt}`);
      const createUrl = 'https://us-west-2.recall.ai/api/v1/bot';
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Token ${recallApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(recallPayload),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text().catch(() => `HTTP ${createResponse.status}`);
        console.error(`[MANAGE-MEETING] Failed to create bot: ${createResponse.status} - ${errorText}`);
        return new Response(
          JSON.stringify({ success: false, message: `Failed to create bot: ${errorText}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const recallData = await createResponse.json();
      const botId = recallData.id;

      if (!botId) {
        console.error(`[MANAGE-MEETING] No bot ID in response:`, recallData);
        return new Response(
          JSON.stringify({ success: false, message: 'No bot ID returned from Recall.ai API' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[MANAGE-MEETING] Bot created successfully: ${botId}`);

      // Update database: set bot_enabled = true, recall_bot_id = botId, status = 'recording_scheduled'
      const { error: updateError } = await supabase
        .from('meetings')
        .update({
          bot_enabled: true,
          recall_bot_id: botId,
          status: 'recording_scheduled',
        })
        .eq('meeting_uuid_id', meetingId);

      if (updateError) {
        console.error(`[MANAGE-MEETING] Failed to update meeting:`, updateError);
        // Try to clean up the bot we just created
        try {
          await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botId}/`, {
            method: 'DELETE',
            headers: {
              Authorization: `Token ${recallApiKey}`,
              'Content-Type': 'application/json',
            },
          });
        } catch (cleanupError) {
          console.error(`[MANAGE-MEETING] Failed to cleanup bot:`, cleanupError);
        }

        return new Response(
          JSON.stringify({ success: false, message: `Failed to update meeting: ${updateError.message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[MANAGE-MEETING] Recording enabled successfully`);
      return new Response(
        JSON.stringify({ success: true, message: 'Recording enabled successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Should never reach here
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid action' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[MANAGE-MEETING] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, message: `Internal server error: ${errorMessage}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

