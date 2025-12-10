// Unified Thread Processor - Processes a SINGLE thread through ALL stages in one invocation
// Triggered by webhook when thread_processing_stages row is inserted
// This eliminates webhook cascades by processing all stages sequentially

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  handleStageError, 
  cleanBodyText, 
  extractMessageBodies,
  formatThreadForLLM,
  chunkThread
} from "../_shared/thread-processing-utils.ts";
import { 
  batchPreFetchCompaniesAndCustomers, 
  getOrCreateCompanyWithLock, 
  getOrCreateCustomerWithLock 
} from "../_shared/company-customer-resolver.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

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
    //
    // Queue-driven processing (INSERT webhook on thread_processing_queue)
    //
    let queueId: string | null = null;
    try {
      const body = await req.json();
      queueId = body?.record?.id || body?.id || null;
    } catch {
      // ignore JSON parse errors
    }

    // Atomically claim ONE queue row by marking processed_at if it was NULL
    let queueEntry: { thread_stage_id: string; sync_job_id: number } | null = null;
    if (queueId) {
      const { data: claimedQueue } = await supabaseAdmin
        .from('thread_processing_queue')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', queueId)
        .is('processed_at', null)
        .select('thread_stage_id, sync_job_id')
        .single();
      if (claimedQueue) {
        queueEntry = claimedQueue;
      }
    }

    // Fallback: if no queue id was provided, try to grab the oldest unprocessed queue row
    if (!queueEntry) {
      const { data: pendingQueue } = await supabaseAdmin
        .from('thread_processing_queue')
        .select('id, thread_stage_id, sync_job_id')
        .is('processed_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (pendingQueue?.id) {
        const { data: claimedQueue } = await supabaseAdmin
          .from('thread_processing_queue')
          .update({ processed_at: new Date().toISOString() })
          .eq('id', pendingQueue.id)
          .is('processed_at', null)
          .select('thread_stage_id, sync_job_id')
          .single();
        if (claimedQueue) {
          queueEntry = claimedQueue;
        }
      }
    }

    if (!queueEntry) {
      return new Response(JSON.stringify({ message: 'No queue items to process' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch the thread stage referenced by the queue entry
    const { data: claimedJob, error: stageError } = await supabaseAdmin
      .from('thread_processing_stages')
      .select('*')
      .eq('id', queueEntry.thread_stage_id)
      .single();

    if (stageError || !claimedJob) {
      return new Response(JSON.stringify({ message: 'Thread stage not found for queue entry' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Process thread through ALL stages sequentially
    // Determine where to resume based on what's already been done
    let currentJob = claimedJob;
    const stagesCompleted: string[] = [];
    
    // If thread was already partially processed, resume from the correct stage
    if (currentJob.stage_imported) stagesCompleted.push('imported');
    if (currentJob.stage_preprocessed) stagesCompleted.push('preprocessed');
    if (currentJob.stage_body_cleaned) stagesCompleted.push('cleaned');
    if (currentJob.stage_chunked) stagesCompleted.push('chunked');

    // ============================================
    // STAGE 1: IMPORT
    // ============================================
    if (!currentJob.stage_imported) {
      try {
        console.log(`📥 [${currentJob.thread_id}] Starting Stage 1: Import`);
        
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            current_stage: 'importing',
            import_attempts: (currentJob.import_attempts || 0) + 1
          })
          .eq('id', currentJob.id);

        // Get provider_token from sync_page_queue
        const { data: pageJob } = await supabaseAdmin
          .from('sync_page_queue')
          .select('provider_token')
          .eq('sync_job_id', currentJob.sync_job_id)
          .eq('page_number', 1)
          .single();

        if (!pageJob?.provider_token) {
          throw new Error('Could not find provider_token for sync job');
        }

        // Fetch thread from Gmail API
        const threadResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${currentJob.thread_id}?format=full`,
          {
            headers: {
              Authorization: `Bearer ${pageJob.provider_token}`
            }
          }
        );

        if (!threadResp.ok) {
          throw new Error(`Gmail API failed: ${await threadResp.text()}`);
        }

        const threadData = await threadResp.json();

        // Mark as imported
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            stage_imported: true,
            imported_at: new Date().toISOString(),
            raw_thread_data: threadData,
            current_stage: 'preprocessing',
            import_error: null
          })
          .eq('id', currentJob.id);

        // Refresh job data
        const { data: updatedJob } = await supabaseAdmin
          .from('thread_processing_stages')
          .select('*')
          .eq('id', currentJob.id)
          .single();
        currentJob = updatedJob!;
        stagesCompleted.push('imported');
        console.log(`✅ [${currentJob.thread_id}] Stage 1 complete: Import`);
      } catch (error) {
        const errorResult = handleStageError(error, currentJob.import_attempts || 0, 3);
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            current_stage: errorResult.shouldRetry ? 'pending' : 'failed',
            import_error: errorResult.errorMessage,
            import_attempts: (currentJob.import_attempts || 0) + 1,
            next_retry_at: errorResult.nextRetryAt?.toISOString() || null
          })
          .eq('id', currentJob.id);
        throw error; // Stop processing if import fails
      }
    } else {
      stagesCompleted.push('imported');
    }

    // ============================================
    // STAGE 2: PREPROCESS
    // ============================================
    if (currentJob.stage_imported && !currentJob.stage_preprocessed) {
      try {
        console.log(`🔍 [${currentJob.thread_id}] Starting Stage 2: Preprocess`);
        
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            preprocess_attempts: (currentJob.preprocess_attempts || 0) + 1
          })
          .eq('id', currentJob.id);

        const threadData = currentJob.raw_thread_data;
        const messages = threadData?.messages || [];
        const userId = currentJob.user_id;

        // Extract emails for batch pre-fetch
        const allEmails = new Set<string>();
        for (const msg of messages) {
          const headers = msg.payload?.headers || [];
          const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
          const toHeader = headers.find((h: any) => h.name.toLowerCase() === 'to')?.value || '';
          const ccHeader = headers.find((h: any) => h.name.toLowerCase() === 'cc')?.value || '';
          
          const allHeaders = [fromHeader, toHeader, ccHeader];
          for (const header of allHeaders) {
            const emails = header.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
            emails.forEach(email => allEmails.add(email));
          }
        }

        // Batch pre-fetch companies and customers
        const preFetchResult = await batchPreFetchCompaniesAndCustomers(
          supabaseAdmin,
          Array.from(allEmails),
          userId
        );

        // Get user email
        const { data: profileData } = await supabaseAdmin
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .single();

        const userEmail = profileData?.email || '';

        // Process thread
        const discoveredCompanyIds = new Map<string, boolean>();
        const discoveredCustomerIds = new Map<string, string>();
        const msgCustomerMap = new Map<string, string | null>();

        for (const msg of messages) {
          const msgHeaders = msg.payload?.headers || [];
          const fromHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
          const toHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'to')?.value || '';
          const ccHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'cc')?.value || '';
          
          const allParticipantHeaders = [fromHeader, toHeader, ccHeader];
          
          for (const header of allParticipantHeaders) {
            const emails = header.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
            for (const email of emails) {
              if (email === userEmail) continue;

              const domain = email.split('@')[1];
              if (!domain) continue;

              try {
                const companyId = await getOrCreateCompanyWithLock(
                  supabaseAdmin,
                  domain,
                  userId,
                  preFetchResult.companies
                );

                const senderName = fromHeader.includes(email)
                  ? (fromHeader.split('<')[0].trim().replace(/"/g, '') || email)
                  : email;

                const customerId = await getOrCreateCustomerWithLock(
                  supabaseAdmin,
                  email,
                  companyId,
                  senderName,
                  preFetchResult.customers
                );

                preFetchResult.companies.set(domain, companyId);
                preFetchResult.customers.set(email, customerId);

                discoveredCompanyIds.set(companyId, true);
                discoveredCustomerIds.set(email, customerId);

                if (fromHeader.includes(email)) {
                  msgCustomerMap.set(msg.id, customerId);
                }
              } catch (error) {
                console.error(`Error processing email ${email} in thread ${currentJob.thread_id}:`, error);
                // Continue processing other emails
              }
            }
          }
        }

        const preprocessedData = {
          messages,
          discoveredCompanyIds: Array.from(discoveredCompanyIds.keys()),
          discoveredCustomerIds: Object.fromEntries(discoveredCustomerIds),
          msgCustomerMap: Object.fromEntries(msgCustomerMap)
        };

        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            stage_preprocessed: true,
            preprocessed_at: new Date().toISOString(),
            preprocessed_data: preprocessedData,
            current_stage: 'cleaning',
            preprocess_error: null
          })
          .eq('id', currentJob.id);

        // Save thread_company_link records
        if (preprocessedData.discoveredCompanyIds.length > 0) {
          const links = preprocessedData.discoveredCompanyIds.map((companyId: string) => ({
            thread_id: currentJob.thread_id,
            company_id: companyId,
            user_id: currentJob.user_id
          }));

          await supabaseAdmin
            .from('thread_company_link')
            .upsert(links, {
              onConflict: 'thread_id, company_id',
              ignoreDuplicates: true
            });
        }

        // Refresh job data
        const { data: updatedJob } = await supabaseAdmin
          .from('thread_processing_stages')
          .select('*')
          .eq('id', currentJob.id)
          .single();
        currentJob = updatedJob!;
        stagesCompleted.push('preprocessed');
        console.log(`✅ [${currentJob.thread_id}] Stage 2 complete: Preprocess`);
      } catch (error) {
        const errorResult = handleStageError(error, currentJob.preprocess_attempts || 0, 3);
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            current_stage: errorResult.shouldRetry ? 'preprocessing' : 'failed',
            preprocess_error: errorResult.errorMessage,
            preprocess_attempts: (currentJob.preprocess_attempts || 0) + 1,
            next_retry_at: errorResult.nextRetryAt?.toISOString() || null
          })
          .eq('id', currentJob.id);
        throw error;
      }
    } else if (currentJob.stage_preprocessed) {
      stagesCompleted.push('preprocessed');
    }

    // ============================================
    // STAGE 3: CLEAN
    // ============================================
    if (currentJob.stage_preprocessed && !currentJob.stage_body_cleaned) {
      try {
        console.log(`🧹 [${currentJob.thread_id}] Starting Stage 3: Clean`);
        
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            clean_attempts: (currentJob.clean_attempts || 0) + 1
          })
          .eq('id', currentJob.id);

        const preprocessed = currentJob.preprocessed_data;
        const messages = preprocessed?.messages || [];

        // Clean body text
        const cleanedMessages = messages.map((msg: any) => {
          const bodies = extractMessageBodies(msg.payload);
          const cleanedText = cleanBodyText(bodies.text);
          const cleanedHtml = bodies.html;

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
          .eq('id', currentJob.id);

        // Save messages to database
        const msgCustomerMap = preprocessed?.msgCustomerMap || {};
        const rawMessages = currentJob.raw_thread_data?.messages || [];

        const messagesToSave = cleanedMessages.map((cleanedMsg: any) => {
          const rawMsg = rawMessages.find((m: any) => m.id === cleanedMsg.id || m.id === cleanedMsg.message_id);
          const msgHeaders = rawMsg?.payload?.headers || cleanedMsg.payload?.headers || [];
          const toValue = msgHeaders.find((h: any) => h.name.toLowerCase() === 'to')?.value || '';
          const ccValue = msgHeaders.find((h: any) => h.name.toLowerCase() === 'cc')?.value || '';

          return {
            message_id: cleanedMsg.id || cleanedMsg.message_id,
            thread_id: currentJob.thread_id,
            user_id: currentJob.user_id,
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
          await supabaseAdmin
            .from('thread_messages')
            .upsert(messagesToSave, {
              onConflict: 'message_id',
              ignoreDuplicates: false
            });
        }

        // Refresh job data
        const { data: updatedJob } = await supabaseAdmin
          .from('thread_processing_stages')
          .select('*')
          .eq('id', currentJob.id)
          .single();
        currentJob = updatedJob!;
        stagesCompleted.push('cleaned');
        console.log(`✅ [${currentJob.thread_id}] Stage 3 complete: Clean`);
      } catch (error) {
        const errorResult = handleStageError(error, currentJob.clean_attempts || 0, 3);
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            current_stage: errorResult.shouldRetry ? 'cleaning' : 'failed',
            clean_error: errorResult.errorMessage,
            clean_attempts: (currentJob.clean_attempts || 0) + 1,
            next_retry_at: errorResult.nextRetryAt?.toISOString() || null
          })
          .eq('id', currentJob.id);
        throw error;
      }
    } else if (currentJob.stage_body_cleaned) {
      stagesCompleted.push('cleaned');
    }

    // ============================================
    // STAGE 4: CHUNK
    // ============================================
    if (currentJob.stage_body_cleaned && !currentJob.stage_chunked) {
      try {
        console.log(`✂️ [${currentJob.thread_id}] Starting Stage 4: Chunk`);
        
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            chunk_attempts: (currentJob.chunk_attempts || 0) + 1
          })
          .eq('id', currentJob.id);

        const cleaned = currentJob.cleaned_body_data;
        const messages = cleaned?.messages || [];

        if (messages.length === 0) {
          throw new Error('No messages found in cleaned body data');
        }

        // Get user email
        const { data: profileData } = await supabaseAdmin
          .from('profiles')
          .select('email')
          .eq('id', currentJob.user_id)
          .single();

        const userEmail = profileData?.email || '';

        // Format and chunk
        const script = formatThreadForLLM(messages, userEmail);
        const chunkData = chunkThread(script, 15);

        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            stage_chunked: true,
            chunked_at: new Date().toISOString(),
            chunks_data: chunkData,
            current_stage: 'summarizing',
            chunk_error: null
          })
          .eq('id', currentJob.id);

        // Enqueue for summarization
        await supabaseAdmin
          .from('thread_summarization_queue')
          .insert({
            thread_id: currentJob.thread_id,
            user_id: currentJob.user_id,
            thread_stage_id: currentJob.id,
            messages: messages,
            user_email: userEmail,
            chunks_data: chunkData,
            requires_map_reduce: chunkData.requires_map_reduce,
            status: 'pending'
          });

        // Refresh job data
        const { data: updatedJob } = await supabaseAdmin
          .from('thread_processing_stages')
          .select('*')
          .eq('id', currentJob.id)
          .single();
        currentJob = updatedJob!;
        stagesCompleted.push('chunked');
        console.log(`✅ [${currentJob.thread_id}] Stage 4 complete: Chunk`);
      } catch (error) {
        const errorResult = handleStageError(error, currentJob.chunk_attempts || 0, 3);
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            current_stage: errorResult.shouldRetry ? 'chunking' : 'failed',
            chunk_error: errorResult.errorMessage,
            chunk_attempts: (currentJob.chunk_attempts || 0) + 1,
            next_retry_at: errorResult.nextRetryAt?.toISOString() || null
          })
          .eq('id', currentJob.id);
        throw error;
      }
    } else if (currentJob.stage_chunked) {
      stagesCompleted.push('chunked');
    }

    // ============================================
    // STAGE 5: SUMMARIZE (async - handled separately)
    // ============================================
    // Summarization is handled by sync-threads-summarizer function
    // We just mark as ready for summarization (already done in chunk stage)

    // FIX: Ensure thread is in correct state after processing
    // If all processing stages (1-4) are complete, ensure current_stage reflects that
    const { data: finalJob } = await supabaseAdmin
      .from('thread_processing_stages')
      .select('*')
      .eq('id', currentJob.id)
      .single();

    if (finalJob) {
      const allProcessingStagesComplete = 
        finalJob.stage_imported && 
        finalJob.stage_preprocessed && 
        finalJob.stage_body_cleaned && 
        finalJob.stage_chunked;

      if (allProcessingStagesComplete && finalJob.current_stage !== 'summarizing' && finalJob.current_stage !== 'completed') {
        // All processing stages done, ensure we're in summarizing state (summarizer will mark as completed)
        await supabaseAdmin
          .from('thread_processing_stages')
          .update({
            current_stage: 'summarizing'
          })
          .eq('id', currentJob.id);
      }
    }

    // Enqueue the next thread for this sync_job (sequential handoff)
    const { data: allThreads } = await supabaseAdmin
      .from('thread_processing_stages')
      .select('id, current_stage')
      .eq('sync_job_id', finalJob?.sync_job_id || currentJob.sync_job_id)
      .order('created_at', { ascending: true });

    const { data: queueRows } = await supabaseAdmin
      .from('thread_processing_queue')
      .select('thread_stage_id, processed_at');

    const activeQueued = new Set<string>();
    const processedQueued = new Set<string>();
    if (queueRows) {
      queueRows.forEach((row: any) => {
        if (row.processed_at === null) {
          activeQueued.add(row.thread_stage_id);
        } else {
          processedQueued.add(row.thread_stage_id);
        }
      });
    }

    let nextThreadId: string | null = null;
    if (allThreads) {
      for (const t of allThreads) {
        if (t.current_stage === 'completed' || t.current_stage === 'failed') continue;
        if (activeQueued.has(t.id)) continue;
        if (processedQueued.has(t.id)) continue;
        nextThreadId = t.id;
        break;
      }
    }

    if (nextThreadId) {
      // Insert next thread into processing queue (triggers next webhook)
      await supabaseAdmin
        .from('thread_processing_queue')
        .insert({
          thread_stage_id: nextThreadId,
          sync_job_id: finalJob?.sync_job_id || currentJob.sync_job_id
        });
    } else {
      // No more threads to enqueue. If no pending/processing summaries, mark job completed.
      const stageIds = (allThreads || []).map((t: any) => t.id);
      const { data: pendingSummaries } = await supabaseAdmin
        .from('thread_summarization_queue')
        .select('thread_stage_id, status')
        .in('thread_stage_id', stageIds.length > 0 ? stageIds : ['00000000-0000-0000-0000-000000000000'])
        .in('status', ['pending', 'processing']);

      const hasActiveThreads = (allThreads || []).some((t: any) => t.current_stage !== 'completed' && t.current_stage !== 'failed');
      const hasActiveSummaries = (pendingSummaries || []).length > 0;

      if (!hasActiveThreads && !hasActiveSummaries) {
        await supabaseAdmin
          .from('sync_jobs')
          .update({
            status: 'completed',
            details: `Sync completed: ${(allThreads || []).filter((t: any) => t.current_stage === 'completed').length} threads processed successfully`
          })
          .eq('id', finalJob?.sync_job_id || currentJob.sync_job_id);

        await supabaseAdmin
          .from('profiles')
          .update({ threads_last_synced_at: new Date().toISOString() })
          .eq('id', finalJob?.user_id || currentJob.user_id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      threadId: currentJob.thread_id,
      stagesCompleted: stagesCompleted,
      currentStage: finalJob?.current_stage || currentJob.current_stage
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error('❌ Error in sync-threads-processor:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});


