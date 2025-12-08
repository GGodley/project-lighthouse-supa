// Stage 2: Preprocessing - Company/customer discovery
// Extracts emails, creates/finds companies and customers with batch pre-fetching

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleStageError } from "../_shared/thread-processing-utils.ts";
import { batchPreFetchCompaniesAndCustomers, getOrCreateCompanyWithLock, getOrCreateCustomerWithLock } from "../_shared/company-customer-resolver.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const CONCURRENCY = 10; // Process 10 threads in parallel

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
    // Fetch threads ready for preprocessing
    const { data: jobs, error } = await supabaseAdmin
      .from('thread_processing_stages')
      .select('*')
      .eq('current_stage', 'preprocessing')
      .eq('stage_imported', true)
      .eq('stage_preprocessed', false)
      .is('preprocess_error', null)
      .order('imported_at', { ascending: true })
      .limit(CONCURRENCY);

    if (error) {
      throw error;
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: 'No threads to preprocess' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Batch pre-fetch: Extract all emails from all threads first
    const allEmails = new Set<string>();
    const userId = jobs[0].user_id;

    for (const job of jobs) {
      const threadData = job.raw_thread_data;
      if (!threadData?.messages) continue;

      for (const msg of threadData.messages) {
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
    }

    // Pre-fetch all companies and customers
    const preFetchResult = await batchPreFetchCompaniesAndCustomers(
      supabaseAdmin,
      Array.from(allEmails),
      userId
    );

    // Get user email for filtering
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    const userEmail = profileData?.email || '';

    // Process threads in parallel
    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        try {
          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              preprocess_attempts: job.preprocess_attempts + 1
            })
            .eq('id', job.id);

          const threadData = job.raw_thread_data;
          const messages = threadData?.messages || [];

          const discoveredCompanyIds = new Map<string, boolean>();
          const discoveredCustomerIds = new Map<string, string>();
          const msgCustomerMap = new Map<string, string | null>();

          // Process each message
          for (const msg of messages) {
            const msgHeaders = msg.payload?.headers || [];
            const fromHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
            const toHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'to')?.value || '';
            const ccHeader = msgHeaders.find((h: any) => h.name.toLowerCase() === 'cc')?.value || '';
            
            const allParticipantHeaders = [fromHeader, toHeader, ccHeader];
            
            for (const header of allParticipantHeaders) {
              const emails = header.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
              for (const email of emails) {
                if (email === userEmail) continue; // Skip internal email

                const domain = email.split('@')[1];
                if (!domain) continue;

                try {
                  // Get or create company (with locking)
                  const companyId = await getOrCreateCompanyWithLock(
                    supabaseAdmin,
                    domain,
                    userId,
                    preFetchResult.companies
                  );

                  // Get or create customer (with locking)
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

                  // Update pre-fetch maps for subsequent threads
                  preFetchResult.companies.set(domain, companyId);
                  preFetchResult.customers.set(email, customerId);

                  discoveredCompanyIds.set(companyId, true);
                  discoveredCustomerIds.set(email, customerId);

                  if (fromHeader.includes(email)) {
                    msgCustomerMap.set(msg.id, customerId);
                  }
                } catch (error) {
                  console.error(`Error processing email ${email} in thread ${job.thread_id}:`, error);
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
            .eq('id', job.id);

          // Save thread_company_link records
          if (preprocessedData.discoveredCompanyIds.length > 0) {
            const links = preprocessedData.discoveredCompanyIds.map((companyId: string) => ({
              thread_id: job.thread_id,
              company_id: companyId,
              user_id: job.user_id
            }));

            const { error: linksError } = await supabaseAdmin
              .from('thread_company_link')
              .upsert(links, {
                onConflict: 'thread_id, company_id',
                ignoreDuplicates: true
              });

            if (linksError) {
              console.error(`Error saving company links for thread ${job.thread_id}:`, linksError);
              // Don't fail the stage, just log the error
            }
          }

          return { success: true, threadId: job.thread_id };
        } catch (error) {
          const errorResult = handleStageError(error, job.preprocess_attempts, 3);

          await supabaseAdmin
            .from('thread_processing_stages')
            .update({
              current_stage: errorResult.shouldRetry ? 'preprocessing' : 'failed',
              preprocess_error: errorResult.errorMessage,
              preprocess_attempts: job.preprocess_attempts + 1,
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
    console.error('❌ Error in sync-threads-preprocessor:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

