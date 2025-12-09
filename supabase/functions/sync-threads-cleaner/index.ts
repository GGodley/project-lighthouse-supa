// Stage 3: Body text cleaning
// Removes signatures, quoted replies, and excessive whitespace

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleStageError, cleanBodyText, extractMessageBodies } from "../_shared/thread-processing-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const CONCURRENCY = 5; // Reduced from 10 to 5 to prevent connection pool exhaustion

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Missing environment variables" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('thread_processing_stages')
      .select('*')
      .eq('current_stage', 'cleaning')
      .eq('stage_preprocessed', true)
      .eq('stage_body_cleaned', false)
      .is('clean_error', null)
      .order('preprocessed_at', { ascending: true })
      .limit(CONCURRENCY);

    if (error) {
      throw error;
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: 'No threads to clean' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        try {
          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              clean_attempts: job.clean_attempts + 1
            })
            .eq('id', job.id);

          const preprocessed = job.preprocessed_data;
          const messages = preprocessed?.messages || [];

          // Clean body text for each message
          const cleanedMessages = messages.map((msg: any) => {
            const bodies = extractMessageBodies(msg.payload);
            const cleanedText = cleanBodyText(bodies.text);
            const cleanedHtml = bodies.html; // Keep HTML as-is for now

            return {
              ...msg,
              cleaned_body_text: cleanedText,
              cleaned_body_html: cleanedHtml
            };
          });

          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              stage_body_cleaned: true,
              body_cleaned_at: new Date().toISOString(),
              cleaned_body_data: { messages: cleanedMessages },
              current_stage: 'chunking',
              clean_error: null
            })
            .eq('id', job.id);

          // Save messages to database
          // Reuse preprocessed variable declared above (line 66)
          const msgCustomerMap = preprocessed?.msgCustomerMap || {};
          const rawMessages = job.raw_thread_data?.messages || [];

          const messagesToSave = cleanedMessages.map((cleanedMsg: any) => {
            const rawMsg = rawMessages.find((m: any) => m.id === cleanedMsg.id || m.id === cleanedMsg.message_id);
            const msgHeaders = rawMsg?.payload?.headers || cleanedMsg.payload?.headers || [];
            const toValue = msgHeaders.find((h: any) => h.name.toLowerCase() === 'to')?.value || '';
            const ccValue = msgHeaders.find((h: any) => h.name.toLowerCase() === 'cc')?.value || '';

            return {
              message_id: cleanedMsg.id || cleanedMsg.message_id,
              thread_id: job.thread_id,
              user_id: job.user_id,
              customer_id: msgCustomerMap[cleanedMsg.id || cleanedMsg.message_id] || null,
              from_address: msgHeaders.find((h: any) => h.name.toLowerCase() === 'from')?.value,
              to_addresses: toValue ? toValue.split(',').map((e: string) => e.trim()) : [],
              cc_addresses: ccValue ? ccValue.split(',').map((e: string) => e.trim()) : [],
              sent_date: new Date(Number(rawMsg?.internalDate || cleanedMsg.internalDate || Date.now())).toISOString(),
              snippet: rawMsg?.snippet || cleanedMsg.snippet || '',
              body_text: cleanedMsg.cleaned_body_text,
              body_html: cleanedMsg.cleaned_body_html
            };
          });

          if (messagesToSave.length > 0) {
            const { error: messagesError } = await supabaseAdmin
              .from('thread_messages')
              .upsert(messagesToSave, {
                onConflict: 'message_id',
                ignoreDuplicates: false
              });

            if (messagesError) {
              console.error(`Error saving messages for thread ${job.thread_id}:`, messagesError);
              // Don't fail the stage, just log the error
            }
          }

          return { success: true, threadId: job.thread_id };
        } catch (error) {
          const errorResult = handleStageError(error, job.clean_attempts, 3);

          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              current_stage: errorResult.shouldRetry ? 'cleaning' : 'failed',
              clean_error: errorResult.errorMessage,
              clean_attempts: job.clean_attempts + 1,
              next_retry_at: errorResult.nextRetryAt?.toISOString() || null
            })
            .eq('id', job.id);

          throw error;
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return new Response(JSON.stringify({
      processed: jobs.length,
      successful,
      failed
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('❌ Error in sync-threads-cleaner:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

