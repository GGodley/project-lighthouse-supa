import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local if it exists
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECALLAI_API_KEY = process.env.RECALLAI_API_KEY;
const TRIGGER_API_KEY = process.env.TRIGGER_API_KEY;

// Debug: Show what we loaded (mask sensitive data)
console.log('🔍 Environment variables loaded:');
console.log(`  SUPABASE_URL: ${SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_KEY ? `✅ Set (${SUPABASE_SERVICE_KEY.length} chars)` : '❌ Missing'}`);
console.log(`  RECALLAI_API_KEY: ${RECALLAI_API_KEY ? `✅ Set (${RECALLAI_API_KEY.length} chars)` : '❌ Missing'}`);
console.log(`  TRIGGER_API_KEY: ${TRIGGER_API_KEY ? `✅ Set (${TRIGGER_API_KEY.length} chars)` : '❌ Missing'}`);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !RECALLAI_API_KEY || !TRIGGER_API_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('  - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  console.error('  - RECALLAI_API_KEY');
  console.error('  - TRIGGER_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function processTranscriptForMeeting(recallBotId: string) {
  try {
    console.log(`\n🔍 Finding meeting with recall_bot_id: ${recallBotId}`);

    // Step 1: Find meeting by recall_bot_id
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, google_event_id, user_id, customer_id, recall_bot_id')
      .eq('recall_bot_id', recallBotId)
      .maybeSingle();

    if (meetingError) {
      throw new Error(`Database error: ${meetingError.message}`);
    }

    if (!meeting) {
      throw new Error(`No meeting found for bot_id: ${recallBotId}`);
    }

    console.log(`✅ Found meeting: id=${meeting.id}, google_event_id=${meeting.google_event_id}`);

    // Step 2: Fetch bot details from Recall.ai to get transcript ID
    // Try different regions in case the API key is for a different region
    console.log(`\n📥 Fetching bot details from Recall.ai...`);
    const regions = ['us-west-2', 'us-east-1', 'eu-central-1', 'ap-northeast-1'];
    let botResponse: Response | null = null;
    let botData: any = null;
    let baseUrl = '';

    for (const region of regions) {
      const url = `https://${region}.recall.ai/api/v1/bot/${recallBotId}`;
      console.log(`   Trying region: ${region}...`);
      const response = await fetch(url, {
        headers: {
          Authorization: `Token ${RECALLAI_API_KEY}`,
        },
      });

      if (response.ok) {
        botResponse = response;
        baseUrl = `https://${region}.recall.ai/api/v1`;
        console.log(`   ✅ Success with region: ${region}`);
        break;
      } else {
        const errorText = await response.text();
        console.log(`   ❌ ${region}: ${response.status} - ${errorText.substring(0, 100)}`);
        
        if (response.status === 404) {
          // Bot not found in this region, try next
          continue;
        } else if (errorText.includes('authentication_failed')) {
          // Auth failed, try next region
          continue;
        }
      }
    }

    if (!botResponse || !botResponse.ok) {
      throw new Error(`Failed to fetch bot from any region. Bot might not exist or API key is invalid.`);
    }

    botData = await botResponse.json();
    console.log(`📊 Bot ID: ${botData?.id}`);
    console.log(`📊 Bot status: ${botData?.status || 'N/A'}`);
    console.log(`📊 Full bot response structure:`, JSON.stringify(botData, null, 2).substring(0, 1000));
    
    // Try to get transcript ID from bot response
    let transcriptId = botData?.transcript?.id || 
                     botData?.data?.transcript?.id ||
                     botData?.transcript_id ||
                     botData?.recording?.transcript?.id;

    // If not in bot response, try to list transcripts and verify they belong to this bot
    if (!transcriptId) {
      console.log(`\n📋 Transcript ID not in bot response. Listing transcripts and verifying ownership...`);
      
      try {
        // List transcripts - we'll need to verify each one belongs to our bot
        const transcriptsResponse = await fetch(
          `${baseUrl}/transcript`,
          {
            headers: {
              Authorization: `Token ${RECALLAI_API_KEY}`,
            },
          }
        );

        if (transcriptsResponse.ok) {
          const transcriptsData = await transcriptsResponse.json();
          let transcripts: any[] = [];
          
          // Normalize the response structure
          if (Array.isArray(transcriptsData)) {
            transcripts = transcriptsData;
          } else if (transcriptsData?.data && Array.isArray(transcriptsData.data)) {
            transcripts = transcriptsData.data;
          } else if (transcriptsData?.results && Array.isArray(transcriptsData.results)) {
            transcripts = transcriptsData.results;
          }
          
          console.log(`📊 Found ${transcripts.length} total transcripts. Searching for one that belongs to bot ${recallBotId}...`);
          
          // For each transcript, we need to check if it belongs to our bot
          // We can do this by fetching the transcript's recording and checking its bot_id
          for (const transcript of transcripts) {
            try {
              // Fetch the transcript metadata to get its recording
              const transcriptMetaResponse = await fetch(
                `${baseUrl}/transcript/${transcript.id}`,
                {
                  headers: {
                    Authorization: `Token ${RECALLAI_API_KEY}`,
                  },
                }
              );
              
              if (transcriptMetaResponse.ok) {
                const transcriptMeta = await transcriptMetaResponse.json();
                const transcriptRecordingId = transcriptMeta?.recording?.id || transcriptMeta?.data?.recording?.id;
                
                if (transcriptRecordingId) {
                  // Fetch the recording to check its bot_id
                  const recordingResponse = await fetch(
                    `${baseUrl}/recording/${transcriptRecordingId}`,
                    {
                      headers: {
                        Authorization: `Token ${RECALLAI_API_KEY}`,
                      },
                    }
                  );
                  
                  if (recordingResponse.ok) {
                    const recordingData = await recordingResponse.json();
                    const recordingBotId = recordingData?.bot?.id || recordingData?.data?.bot?.id || recordingData?.bot_id;
                    
                    if (recordingBotId === recallBotId) {
                      transcriptId = transcript.id;
                      console.log(`✅ Found matching transcript ID: ${transcriptId} (belongs to bot ${recallBotId})`);
                      break;
                    }
                  }
                }
              }
            } catch (checkError) {
              // Skip this transcript if we can't verify it
              continue;
            }
          }
          
          if (!transcriptId) {
            console.warn(`⚠️  Could not find a transcript that belongs to bot ${recallBotId}`);
            console.warn(`   This might mean the bot hasn't completed recording yet, or the transcript isn't ready.`);
          }
        } else {
          const errorText = await transcriptsResponse.text();
          console.log(`⚠️  Failed to list transcripts: ${transcriptsResponse.status} - ${errorText}`);
        }
      } catch (listError) {
        console.log(`⚠️  Error finding transcript:`, listError);
      }
    }

    if (!transcriptId) {
      throw new Error(`Bot does not have a transcript yet. Bot status: ${botData?.status || 'unknown'}. Please check if the meeting has completed and the transcript is ready.`);
    }

    console.log(`✅ Found transcript ID: ${transcriptId}`);

    // Step 3: Fetch transcript metadata
    console.log(`\n📥 Fetching transcript metadata...`);
    const metaResponse = await fetch(
      `${baseUrl}/transcript/${transcriptId}`,
      {
        headers: {
          Authorization: `Token ${RECALLAI_API_KEY}`,
        },
      }
    );

    if (!metaResponse.ok) {
      const errorText = await metaResponse.text();
      throw new Error(`Failed to fetch transcript metadata: ${metaResponse.status} - ${errorText}`);
    }

    const metaData = await metaResponse.json();
    const downloadUrl = metaData?.data?.download_url;

    if (!downloadUrl) {
      throw new Error('Metadata is missing the download_url');
    }

    console.log(`✅ Got download URL`);

    // Step 4: Download transcript content
    console.log(`\n📥 Downloading transcript content...`);
    const contentResponse = await fetch(downloadUrl);
    if (!contentResponse.ok) {
      throw new Error(`Failed to download transcript: ${contentResponse.status}`);
    }

    const transcriptContent = await contentResponse.json();
    console.log(`✅ Transcript downloaded (${Array.isArray(transcriptContent) ? transcriptContent.length : 'N/A'} segments)`);

    // Step 5: Format transcript with speaker names
    console.log(`\n📝 Formatting transcript...`);
    let formattedTranscript = '';
    if (Array.isArray(transcriptContent)) {
      const transcriptLines: string[] = [];

      for (const segment of transcriptContent) {
        const speakerName =
          segment.participant?.name ||
          segment.participant?.email?.split('@')[0] ||
          'Unknown Speaker';

        let segmentText = '';
        if (Array.isArray(segment.words)) {
          segmentText = segment.words.map((w: any) => w.text).join(' ');
        } else if (segment.text) {
          segmentText = segment.text;
        }

        if (segmentText.trim()) {
          transcriptLines.push(`${speakerName}: ${segmentText}`);
        }
      }

      formattedTranscript = transcriptLines.join('\n\n');
    } else {
      formattedTranscript = JSON.stringify(transcriptContent);
    }

    if (!formattedTranscript || formattedTranscript.trim().length < 50) {
      throw new Error('Transcript is too short or empty');
    }

    console.log(`✅ Formatted transcript (${formattedTranscript.length} characters)`);
    console.log(`\n📄 First 500 characters of transcript:`);
    console.log(formattedTranscript.substring(0, 500) + '...');

    // Step 6: Save transcript to meetings table
    console.log(`\n💾 Saving transcript to meetings table...`);
    const { error: transcriptUpdateError } = await supabase
      .from('meetings')
      .update({
        transcripts: formattedTranscript,
        // Note: 'completed' is not in the allowed statuses. Using 'recording_scheduled' 
        // which is the current status for meetings with transcripts.
        // TODO: Add 'completed' to the status check constraint if needed
        status: 'recording_scheduled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', meeting.id);

    if (transcriptUpdateError) {
      throw new Error(`Failed to save transcript: ${transcriptUpdateError.message}`);
    }

    console.log(`✅ Transcript saved to meetings table`);

    // Step 7: Delete meeting data from Recall.ai (optional - comment out if you want to keep it)
    console.log(`\n🗑️  Deleting meeting data from Recall.ai...`);
    try {
      const deleteResponse = await fetch(
        `${baseUrl}/bot/${recallBotId}/delete_media/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${RECALLAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        console.warn(`⚠️  Failed to delete Recall.ai media: ${deleteResponse.status}`);
      } else {
        console.log(`✅ Recall.ai media deleted`);
      }
    } catch (deleteError) {
      console.warn(`⚠️  Error deleting Recall.ai media:`, deleteError);
    }

    // Step 8: Trigger Trigger.dev task for LLM analysis
    console.log(`\n🤖 Triggering Trigger.dev for LLM analysis...`);
    try {
      const triggerUrl = `https://api.trigger.dev/api/v1/tasks/generate-meeting-summary/trigger`;
      const triggerResponse = await fetch(triggerUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TRIGGER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: {
            meetingId: meeting.id.toString(),
            googleEventId: meeting.google_event_id,
            transcript: formattedTranscript,
            userId: meeting.user_id,
          },
        }),
      });

      if (!triggerResponse.ok) {
        const errorText = await triggerResponse.text();
        throw new Error(
          `Failed to trigger Trigger.dev: ${triggerResponse.status} - ${errorText}`
        );
      }

      const triggerResult = await triggerResponse.json();
      console.log(`✅ Trigger.dev task triggered for meeting analysis`);
      console.log(`📊 Trigger response:`, JSON.stringify(triggerResult, null, 2));
    } catch (triggerError) {
      console.error(`⚠️  Failed to trigger Trigger.dev:`, triggerError);
      throw triggerError;
    }

    console.log(`\n✅✅✅ SUCCESS! Transcript processed and LLM analysis triggered.`);
    console.log(`   Meeting ID: ${meeting.id}`);
    console.log(`   Google Event ID: ${meeting.google_event_id}`);
    console.log(`   Transcript length: ${formattedTranscript.length} characters`);

  } catch (error) {
    console.error('\n❌ Error processing transcript:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Main execution - using your specific recall_bot_id
const RECALL_BOT_ID = '7271dd2e-602d-4983-921b-b44e9eaeeba3';

console.log('🚀 Starting transcript processing test...');
console.log(`📋 Recall Bot ID: ${RECALL_BOT_ID}`);

processTranscriptForMeeting(RECALL_BOT_ID).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

