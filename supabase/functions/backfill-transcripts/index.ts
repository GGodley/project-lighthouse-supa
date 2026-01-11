import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Backfill Transcripts Edge Function - Recovers missing transcript data
 * 
 * Modes:
 * - dry-run: Count and return candidate IDs without processing
 * - test-one: Process a single meeting for testing
 * - batch: Process multiple meetings (default limit: 5)
 * 
 * Recovery Flow (for test-one/batch):
 * 1. Check Recall.ai bot status
 * 2. Fetch transcript if available
 * 3. Format transcript with speaker names
 * 4. Update meetings table
 * 5. Trigger Trigger.dev task for LLM analysis
 * 6. Recalculate company health score
 * 7. Delete media from Recall.ai
 */
Deno.serve(async (req) => {
  try {
    console.log("[START] Backfill transcripts function called");

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'dry-run';
    const limit = mode === 'batch' ? (body.limit || 5) : mode === 'test-one' ? 1 : undefined;
    const debug = body.debug === true; // Include API call details in response
    const meetingId = body.meeting_id ? parseInt(body.meeting_id) : null; // Target specific meeting ID

    if (!['dry-run', 'test-one', 'batch'].includes(mode)) {
      return new Response(
        JSON.stringify({ error: 'Invalid mode. Must be: dry-run, test-one, or batch' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[LOG] Mode: ${mode}, Limit: ${limit || 'N/A'}`);

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get Recall.ai API key
    const recallApiKey = Deno.env.get('RECALLAI_API_KEY');
    if (!recallApiKey) {
      throw new Error('RECALLAI_API_KEY not configured');
    }

    // Common query: Find meetings that need transcript recovery
    // Also include meetings with transcripts but dispatch_status still 'pending' (to fix status)
    const now = new Date().toISOString();
    let query = supabaseClient
      .from('meetings')
      .select('id, recall_bot_id, google_event_id, user_id, customer_id, company_id, start_time, status, dispatch_status, transcript')
      .not('recall_bot_id', 'is', null)
      .lt('start_time', now)
      .neq('status', 'error')
      .or('transcript.is.null,transcript.eq.,and(transcript.neq.,dispatch_status.eq.pending)');

    // If specific meeting ID is provided, target only that meeting
    if (meetingId) {
      query = query.eq('id', meetingId);
      console.log(`[LOG] Targeting specific meeting ID: ${meetingId}`);
    } else if (limit !== undefined) {
      // Apply limit for test-one and batch modes
      query = query.limit(limit);
    }

    const { data: meetings, error: queryError } = await query;

    if (queryError) {
      throw new Error(`Database query error: ${queryError.message}`);
    }

    if (!meetings || meetings.length === 0) {
      console.log("[LOG] No meetings found matching criteria");
      return new Response(
        JSON.stringify({
          mode,
          count: 0,
          candidate_ids: [],
          processed: 0,
          successful: [],
          failed: [],
          errors: []
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[LOG] Found ${meetings.length} meeting(s) matching criteria`);

    // For dry-run mode, just return the count and IDs
    if (mode === 'dry-run') {
      const candidateIds = meetings.map(m => m.id.toString());
      return new Response(
        JSON.stringify({
          mode,
          count: meetings.length,
          candidate_ids: candidateIds
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // For test-one and batch modes, process each meeting
    const results: any = {
      mode,
      processed: 0,
      successful: [] as string[],
      failed: [] as string[],
      errors: [] as string[]
    };

    // Add debug info if requested
    if (debug) {
      results.api_calls = [] as any[];
    }

    for (const meeting of meetings) {
      const meetingId = meeting.id.toString();
      const botId = meeting.recall_bot_id;

      console.log(`[LOG] Processing meeting ${meetingId} with bot_id ${botId}`);

      // If meeting already has transcript but dispatch_status is pending, just update status
      if (meeting.transcript && meeting.transcript.trim() && meeting.dispatch_status === 'pending') {
        console.log(`[LOG] Meeting ${meetingId} already has transcript, updating dispatch_status to completed`);
        await supabaseClient
          .from('meetings')
          .update({
            dispatch_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', meeting.id);
        results.processed++;
        results.successful.push(meetingId);
        continue;
      }

      try {
        // --- Recovery Flow ---

        // 1. Check Bot Status
        const botStatusUrl = `https://us-west-2.recall.ai/api/v1/bot/${botId}`;
        console.log(`[API] Making request to Recall.ai:`);
        console.log(`[API]   URL: ${botStatusUrl}`);
        console.log(`[API]   Method: GET`);
        console.log(`[API]   API Key present: ${recallApiKey ? 'YES' : 'NO'}`);
        console.log(`[API]   API Key length: ${recallApiKey?.length || 0} characters`);
        
        const apiCallStart = Date.now();
        const statusResponse = await fetch(
          botStatusUrl,
          { headers: { Authorization: `Token ${recallApiKey}` } }
        );
        const apiCallDuration = Date.now() - apiCallStart;

        console.log(`[API] Response received:`);
        console.log(`[API]   Status: ${statusResponse.status} ${statusResponse.statusText}`);
        console.log(`[API]   Headers: ${JSON.stringify(Object.fromEntries(statusResponse.headers.entries()))}`);

        if (statusResponse.status === 404) {
          console.log(`[LOG] Bot ${botId} not found (404), marking as error`);
          await supabaseClient
            .from('meetings')
            .update({ status: 'error', updated_at: new Date().toISOString() })
            .eq('id', meeting.id);
          
          // Bot doesn't exist, so no media to delete
          results.failed.push(meetingId);
          results.errors.push(`Meeting ${meetingId}: Bot not found (404)`);
          continue;
        }

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          throw new Error(`Failed to fetch bot status: ${statusResponse.status} - ${errorText}`);
        }

        const botData = await statusResponse.json();
        console.log(`[API] Bot data received: ${JSON.stringify(botData).substring(0, 1000)}...`);
        const botStatus = botData?.status || botData?.data?.status;
        console.log(`[API] Extracted bot status: ${botStatus}`);
        
        // Store API call details for debug mode (after botData is available)
        if (debug) {
          const recordings = botData?.recordings || botData?.data?.recordings || [];
          results.api_calls.push({
            meeting_id: meetingId,
            bot_id: botId,
            call: 'check_bot_status',
            url: botStatusUrl,
            method: 'GET',
            status: statusResponse.status,
            status_text: statusResponse.statusText,
            duration_ms: apiCallDuration,
            timestamp: new Date().toISOString(),
            bot_data: botData, // Include bot data in debug response
            recordings_count: recordings.length,
            has_transcript_in_recordings: recordings.length > 0 && !!(recordings[0]?.media_shortcuts?.transcript?.data?.download_url || recordings[0]?.transcript?.data?.download_url)
          });
        }
        
        // Check if transcript ID is in bot data
        let transcriptIdFromBot = botData?.transcript?.id || botData?.data?.transcript?.id || botData?.recording?.transcript?.id;
        if (transcriptIdFromBot) {
          console.log(`[API] Found transcript ID in bot data: ${transcriptIdFromBot}`);
        } else {
          console.log(`[API] No transcript ID found in bot data. Available keys: ${Object.keys(botData).join(', ')}`);
        }

        // Check for fatal statuses
        if (['fatal', 'payment_required', 'error'].includes(botStatus)) {
          console.log(`[LOG] Bot ${botId} has fatal status: ${botStatus}`);
          await supabaseClient
            .from('meetings')
            .update({
              status: 'error',
              transcript: 'Recording failed',
              updated_at: new Date().toISOString()
            })
            .eq('id', meeting.id);
          
          // Still try to delete media even if bot has fatal status
          const deleteMediaUrl = `https://us-west-2.recall.ai/api/v1/bot/${botId}/delete_media/`;
          console.log(`[API] Attempting to delete media for bot with fatal status:`);
          console.log(`[API]   URL: ${deleteMediaUrl}`);
          console.log(`[API]   Method: POST`);
          try {
            const deleteCallStart = Date.now();
            const deleteResponse = await fetch(
              deleteMediaUrl,
              {
                method: 'POST',
                headers: {
                  Authorization: `Token ${recallApiKey}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            const deleteCallDuration = Date.now() - deleteCallStart;

            console.log(`[API] Delete media response:`);
            console.log(`[API]   Status: ${deleteResponse.status} ${deleteResponse.statusText}`);

            // Store API call details for debug mode
            if (debug) {
              results.api_calls.push({
                meeting_id: meetingId,
                bot_id: botId,
                call: 'delete_media',
                url: deleteMediaUrl,
                method: 'POST',
                status: deleteResponse.status,
                status_text: deleteResponse.statusText,
                duration_ms: deleteCallDuration,
                timestamp: new Date().toISOString()
              });
            }

            if (!deleteResponse.ok && deleteResponse.status !== 404) {
              console.warn(`⚠️  Failed to delete Recall.ai media: ${deleteResponse.status}`);
            } else {
              console.log(`[SUCCESS] Recall.ai media deleted (or already deleted)`);
            }
          } catch (deleteError) {
            console.warn(`⚠️  Error deleting Recall.ai media:`, deleteError);
            // Don't fail the process
          }
          
          results.failed.push(meetingId);
          results.errors.push(`Meeting ${meetingId}: Bot status is ${botStatus}`);
          continue;
        }

        // 2. Fetch Transcript
        // Check if transcript is available in bot recordings data
        let transcriptDownloadUrl: string | null = null;
        let transcriptIdFromRecordings: string | null = null;
        const recordings = botData?.recordings || botData?.data?.recordings || [];
        
        console.log(`[API] Checking recordings for transcript. Found ${recordings.length} recording(s)`);
        
        if (recordings.length > 0) {
          const recording = recordings[0];
          console.log(`[API] Recording structure: ${JSON.stringify(Object.keys(recording)).substring(0, 200)}`);
          
          // Try to get transcript ID and download URL from recordings
          transcriptIdFromRecordings = recording?.media_shortcuts?.transcript?.id || 
                                      recording?.transcript?.id || 
                                      null;
          transcriptDownloadUrl = recording?.media_shortcuts?.transcript?.data?.download_url ||
                                  recording?.transcript?.data?.download_url ||
                                  recording?.transcript?.download_url;
          
          if (transcriptDownloadUrl) {
            console.log(`[API] ✅ Found transcript download URL in bot recordings data`);
            console.log(`[API]   Transcript ID: ${transcriptIdFromRecordings || 'N/A'}`);
            console.log(`[API]   Download URL: ${transcriptDownloadUrl.substring(0, 100)}...`);
          } else if (transcriptIdFromRecordings) {
            console.log(`[API] ⚠️ Found transcript ID in recordings but no download URL`);
            console.log(`[API]   Transcript ID: ${transcriptIdFromRecordings}`);
            console.log(`[API]   Will try to fetch via transcript API endpoint`);
          } else {
            console.log(`[API] ❌ No transcript ID or download URL found in recording`);
            console.log(`[API]   Has media_shortcuts: ${!!recording?.media_shortcuts}`);
            console.log(`[API]   Has transcript: ${!!recording?.transcript}`);
            if (recording?.media_shortcuts) {
              console.log(`[API]   media_shortcuts keys: ${Object.keys(recording.media_shortcuts).join(', ')}`);
            }
          }
        } else {
          console.log(`[API] No recordings found in bot data`);
        }
        
        // If not in recordings, try the transcript API endpoint
        if (!transcriptDownloadUrl) {
          // Use transcript ID from recordings if available, otherwise try bot ID
          const transcriptIdToUse = transcriptIdFromRecordings || transcriptIdFromBot || botId;
          const transcriptUrl = `https://us-west-2.recall.ai/api/v1/transcript/${transcriptIdToUse}`;
          console.log(`[API] Transcript not in recordings, trying API endpoint:`);
          console.log(`[API]   URL: ${transcriptUrl}`);
          console.log(`[API]   Method: GET`);
          
          const transcriptCallStart = Date.now();
          const transcriptResponse = await fetch(
            transcriptUrl,
            { headers: { Authorization: `Token ${recallApiKey}` } }
          );
          const transcriptCallDuration = Date.now() - transcriptCallStart;

          console.log(`[API] Response received:`);
          console.log(`[API]   Status: ${transcriptResponse.status} ${transcriptResponse.statusText}`);

          // Store API call details for debug mode
          if (debug) {
            results.api_calls.push({
              meeting_id: meetingId,
              bot_id: botId,
              call: 'fetch_transcript_metadata',
              url: transcriptUrl,
              method: 'GET',
              status: transcriptResponse.status,
              status_text: transcriptResponse.statusText,
              duration_ms: transcriptCallDuration,
              timestamp: new Date().toISOString()
            });
          }

          if (transcriptResponse.status === 404) {
            console.log(`[LOG] Transcript not found (404) for bot ${botId}`);
            await supabaseClient
              .from('meetings')
              .update({
                status: 'recording_scheduled', // Use valid status - meeting was recorded but transcript unavailable
                transcript: 'No transcript available',
                updated_at: new Date().toISOString()
              })
              .eq('id', meeting.id);
            
            // Still try to delete media even if transcript is not available
          const deleteMediaUrl = `https://us-west-2.recall.ai/api/v1/bot/${botId}/delete_media/`;
          console.log(`[API] Attempting to delete media even though transcript is 404:`);
          console.log(`[API]   URL: ${deleteMediaUrl}`);
          console.log(`[API]   Method: POST`);
          try {
            const deleteCallStart = Date.now();
            const deleteResponse = await fetch(
              deleteMediaUrl,
              {
                method: 'POST',
                headers: {
                  Authorization: `Token ${recallApiKey}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            const deleteCallDuration = Date.now() - deleteCallStart;

            console.log(`[API] Delete media response:`);
            console.log(`[API]   Status: ${deleteResponse.status} ${deleteResponse.statusText}`);

            // Store API call details for debug mode
            if (debug) {
              results.api_calls.push({
                meeting_id: meetingId,
                bot_id: botId,
                call: 'delete_media',
                url: deleteMediaUrl,
                method: 'POST',
                status: deleteResponse.status,
                status_text: deleteResponse.statusText,
                duration_ms: deleteCallDuration,
                timestamp: new Date().toISOString()
              });
            }

            if (!deleteResponse.ok && deleteResponse.status !== 404) {
              console.warn(`⚠️  Failed to delete Recall.ai media: ${deleteResponse.status}`);
            } else {
              console.log(`[SUCCESS] Recall.ai media deleted (or already deleted)`);
            }
          } catch (deleteError) {
            console.warn(`⚠️  Error deleting Recall.ai media:`, deleteError);
            // Don't fail the process - transcript is already marked as unavailable
          }
          
            results.failed.push(meetingId);
            results.errors.push(`Meeting ${meetingId}: Transcript not found (404)`);
            continue;
          }

          if (!transcriptResponse.ok) {
            const errorText = await transcriptResponse.text();
            throw new Error(`Failed to fetch transcript: ${transcriptResponse.status} - ${errorText}`);
          }

          const transcriptMeta = await transcriptResponse.json();
          console.log(`[API] Transcript metadata received: ${JSON.stringify(transcriptMeta).substring(0, 500)}...`);
          transcriptDownloadUrl = transcriptMeta?.data?.download_url || transcriptMeta?.download_url;

          if (!transcriptDownloadUrl) {
            throw new Error('Transcript metadata missing download_url');
          }
        }

        // Download transcript content
        if (!transcriptDownloadUrl) {
          throw new Error('No transcript download URL available');
        }

        console.log(`[API] Downloading transcript content:`);
        console.log(`[API]   URL: ${transcriptDownloadUrl.substring(0, 100)}...`);
        console.log(`[API]   Method: GET`);
        const contentResponse = await fetch(transcriptDownloadUrl);
        console.log(`[API]   Response status: ${contentResponse.status} ${contentResponse.statusText}`);
        if (!contentResponse.ok) {
          throw new Error(`Failed to download transcript: ${contentResponse.status}`);
        }

        const transcriptContent = await contentResponse.json();
        console.log(`[LOG] Transcript downloaded successfully`);

        // 3. Format Transcript
        let formattedTranscript = '';
        if (Array.isArray(transcriptContent)) {
          const transcriptLines: string[] = [];
          
          for (const segment of transcriptContent) {
            // Extract speaker name
            const speakerName = segment.participant?.name || 
                              segment.participant?.email?.split('@')[0] || 
                              'Unknown Speaker';
            
            // Extract words and combine into text
            let segmentText = '';
            if (Array.isArray(segment.words)) {
              segmentText = segment.words.map((w: any) => w.text).join(' ');
            } else if (segment.text) {
              segmentText = segment.text;
            }

            if (segmentText.trim()) {
              // Format: "Speaker Name: text"
              transcriptLines.push(`${speakerName}: ${segmentText}`);
            }
          }
          
          formattedTranscript = transcriptLines.join('\n\n');
        } else {
          // Fallback: if not array format, try to extract text
          formattedTranscript = JSON.stringify(transcriptContent);
        }

        if (!formattedTranscript || formattedTranscript.trim().length < 50) {
          throw new Error('Transcript is too short or empty');
        }

        console.log(`[LOG] Formatted transcript (length: ${formattedTranscript.length})`);

        // 4. Trigger Trigger.dev Task - Let it handle saving transcript, deleting media, AI analysis, and health score
        console.log(`[LOG] Triggering Trigger.dev task to handle complete flow...`);
        try {
          const triggerApiKey = Deno.env.get("TRIGGER_API_KEY");
          if (!triggerApiKey) {
            throw new Error("TRIGGER_API_KEY not configured");
          }

          const triggerUrl = `https://api.trigger.dev/api/v1/tasks/generate-meeting-summary/trigger`;
          const triggerResponse = await fetch(triggerUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${triggerApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              payload: {
                meetingId: meeting.id.toString(),
                googleEventId: meeting.google_event_id,
                transcript: formattedTranscript,
                userId: meeting.user_id,
                recallBotId: botId, // Pass bot ID so Trigger.dev can delete media
                saveTranscript: true, // Tell Trigger.dev to save the transcript
                deleteMedia: true, // Tell Trigger.dev to delete media
              },
            }),
          });

          if (!triggerResponse.ok) {
            const errorText = await triggerResponse.text();
            throw new Error(
              `Failed to trigger Trigger.dev: ${triggerResponse.status} - ${errorText}`
            );
          }

          console.log(`[SUCCESS] Trigger.dev task triggered - it will handle saving transcript, AI analysis, health score, and media deletion`);
        } catch (triggerError) {
          console.error(`⚠️  Failed to trigger Trigger.dev:`, triggerError);
          throw triggerError; // Fail if we can't trigger - transcript recovery is incomplete
        }

        results.processed++;
        results.successful.push(meetingId);
        console.log(`[SUCCESS] Meeting ${meetingId} processed successfully`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[ERROR] Failed to process meeting ${meetingId}:`, errorMessage);
        results.processed++;
        results.failed.push(meetingId);
        results.errors.push(`Meeting ${meetingId}: ${errorMessage}`);
        // Continue processing other meetings
      }
    }

    console.log(`[END] Processed ${results.processed} meeting(s)`);
    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ERROR] Backfill transcripts function error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        mode: 'error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

