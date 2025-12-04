import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { saveFeatureRequests, FeatureRequest } from '../_shared/feature-request-utils.ts';
import { mapFeatureRequests } from '../_shared/feature-request-mapper.ts';
import { ensureCompanyAndCustomer } from '../_shared/company-customer-resolver.ts';

Deno.serve(async (req)=>{
  try {
    const body = await req.json();
    const job = body.record;
    if (!job || !job.id || !job.meeting_id) {
      return new Response(JSON.stringify({
        error: 'Invalid payload: missing job or identifiers'
      }), {
        status: 400
      });
    }

    const raw = job.summary_raw_response ?? '';
    let discussionPoints = '';
    let actionItems: any[] = []; // Changed to array for structured next steps
    let sentimentText = 'Neutral'; // Default text
    let sentimentScore = 0;     // Default score (Neutral)
    let featureRequests: FeatureRequest[] = [];

    try {
      const parsed = JSON.parse(raw);
      
      discussionPoints = typeof parsed.discussion_points === 'string' ? parsed.discussion_points.trim() : '';
      
      // Handle structured action_items array
      if (Array.isArray(parsed.action_items)) {
        actionItems = parsed.action_items.map((item: any) => ({
          text: typeof item.text === 'string' ? item.text.trim() : '',
          owner: typeof item.owner === 'string' ? item.owner.trim() : null,
          due_date: typeof item.due_date === 'string' ? item.due_date.trim() : null
        })).filter((item: any) => item.text !== ''); // Filter out empty items
      } else if (typeof parsed.action_items === 'string') {
        // Legacy format: convert string to array format for backward compatibility
        const text = parsed.action_items.trim();
        if (text && text !== 'No action items were identified.') {
          actionItems = [{ text, owner: null, due_date: null }];
        }
      }

      // Get the new sentiment text
      const s = typeof parsed.sentiment === 'string' ? parsed.sentiment.trim() : 'Neutral';
      sentimentText = [
        'Very Positive',
        'Positive',
        'Neutral',
        'Negative',
        'Frustrated'
      ].includes(s) ? s : 'Neutral';

      // Get the new sentiment score
      const score = parsed.sentiment_score;
      sentimentScore = typeof score === 'number' && score >= -3 && score <= 3 ? score : 0;

      // Parse feature requests with validation (supports both new and old format)
      if (Array.isArray(parsed.feature_requests)) {
        featureRequests = mapFeatureRequests(parsed.feature_requests);
      }

    } catch (e) {
      console.error('Failed to parse summary_raw_response JSON. Falling back to empty/neutral fields.', e);
      discussionPoints = '';
      actionItems = [];
      sentimentText = 'Neutral';
      sentimentScore = 0;
      featureRequests = [];
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // --- THIS IS THE KEY UPDATE ---
    // Update meetings with all four parsed sections
    // Store actionItems as JSONB array (null if empty)
    const { error: meetingErr } = await supabase.from('meetings').update({
      summary: discussionPoints,
      next_steps: actionItems.length > 0 ? actionItems : null, // Store as JSONB array or null
      customer_sentiment: sentimentText,  // The text (e.g., "Positive")
      sentiment_score: sentimentScore     // The number (e.g., 2)
    }).eq('google_event_id', job.meeting_id);
    // ----------------------------

    if (meetingErr) {
      console.error('Failed to update meetings:', meetingErr);
      throw new Error(`Failed to update meeting: ${meetingErr.message}`);
    }

    // Process next steps if action items exist
    if (actionItems.length > 0) {
      // Call process-next-steps edge function asynchronously
      supabase.functions.invoke('process-next-steps', {
        body: {
          source_type: 'meeting',
          source_id: job.meeting_id
        }
      }).catch(err => {
        console.error(`Failed to invoke process-next-steps for meeting ${job.meeting_id}:`, err);
        // Don't throw - this is not critical for the summary processing to continue
      });
    }

    // Process feature requests if they exist
    if (featureRequests.length > 0) {
      try {
        // Get user_id from transcription_jobs
        const { data: jobData, error: jobDataError } = await supabase
          .from('transcription_jobs')
          .select('user_id')
          .eq('id', job.id)
          .single();

        if (jobDataError || !jobData?.user_id) {
          console.error(`Failed to fetch user_id from transcription_jobs: ${jobDataError?.message || 'User not found'}`);
        } else {
          const userId = jobData.user_id;

          // Get meeting to find customer_id
          const { data: meeting, error: meetingError } = await supabase
            .from('meetings')
            .select('customer_id, id')
            .eq('google_event_id', job.meeting_id)
            .single();

          if (meetingError || !meeting) {
            console.error(`Failed to fetch meeting for feature requests: ${meetingError?.message || 'Meeting not found'}`);
          } else if (!meeting.customer_id) {
            console.error(`Meeting ${meeting.id} has no customer_id, cannot save feature requests`);
          } else {
            // Get customer email for resolver
            const { data: customer, error: customerError } = await supabase
              .from('customers')
              .select('company_id, email')
              .eq('customer_id', meeting.customer_id)
              .single();

            if (customerError || !customer) {
              console.error(`Failed to fetch customer for feature requests: ${customerError?.message || 'Customer not found'}`);
            } else {
              try {
                // Use resolver to ensure company_id exists
                const { company_id, customer_id } = await ensureCompanyAndCustomer(
                  supabase,
                  meeting.customer_id,
                  customer.email,
                  userId
                );

                // Save feature requests using shared utility
                const result = await saveFeatureRequests(
                  supabase,
                  featureRequests,
                  {
                    company_id: company_id,
                    customer_id: customer_id,
                    source: 'meeting',
                    meeting_id: meeting.id
                  }
                );

                if (result.success) {
                  console.log(`✅ Successfully saved ${result.savedCount} feature requests from meeting ${job.meeting_id}`);
                } else {
                  console.warn(`⚠️ Saved ${result.savedCount} feature requests with ${result.errors.length} errors`);
                }
              } catch (resolveError: any) {
                console.error(`Failed to resolve company/customer for feature requests: ${resolveError.message}`);
                // Don't throw - feature request processing failure shouldn't break the summary flow
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`Error processing feature requests for meeting ${job.meeting_id}:`, error.message);
        // Don't throw - feature request processing failure shouldn't break the summary flow
      }
    }

    // Finalize transcription job status
    const { error: jobErr } = await supabase.from('transcription_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString()
    }).eq('id', job.id);

    if (jobErr) {
      console.error('Failed to update transcription_jobs:', jobErr);
      throw new Error(`Failed to update job status: ${jobErr.message}`);
    }

    console.log(`✅ Summary processing completed for meeting ${job.meeting_id}`);

    // Note: Recall.ai media cleanup is now handled in process-transcript function
    // after the transcript is verified and saved. This ensures cleanup happens
    // as soon as we have the transcript, not waiting for summary generation.

    return new Response(JSON.stringify({
      success: true
    }), {
      status: 200
    });

  } catch (err) {
    console.error('process-summary error:', err);
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500
    });
  }
});


