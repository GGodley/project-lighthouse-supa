// Orchestrator function for parallel staged thread sync
// Entry point called from frontend - creates sync_job and initial page queue job

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { provider_token, userId } = await req.json();

    if (!provider_token || !userId) {
      throw new Error("Missing provider_token or userId in request body.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Create sync_job record
    const { data: syncJob, error: jobError } = await supabaseAdmin
      .from('sync_jobs')
      .insert({
        user_id: userId,
        status: 'pending'
      })
      .select()
      .single();

    if (jobError || !syncJob) {
      throw new Error(`Failed to create sync job: ${jobError?.message || 'Unknown error'}`);
    }

    const jobId = syncJob.id;

    // Create initial page queue job (page 1)
    // FIX: Set next_retry_at to NOW() so the page is immediately processable by webhook
    const idempotencyKey = `${jobId}-page-1`;
    const { data: pageJob, error: pageError } = await supabaseAdmin
      .from('sync_page_queue')
      .insert({
        sync_job_id: jobId,
        user_id: userId,
        provider_token: provider_token, // In production, encrypt this
        page_number: 1,
        idempotency_key: idempotencyKey,
        next_retry_at: new Date().toISOString() // Set to NOW() so it's immediately processable
      })
      .select()
      .single();

    if (pageError || !pageJob) {
      // Rollback: mark sync_job as failed
      await supabaseAdmin
        .from('sync_jobs')
        .update({ status: 'failed', details: `Failed to create page queue job: ${pageError?.message || 'Unknown error'}` })
        .eq('id', jobId);
      
      throw new Error(`Failed to create page queue job: ${pageError?.message || 'Unknown error'}`);
    }

    // Update sync_job status to running
    await supabaseAdmin
      .from('sync_jobs')
      .update({ status: 'running', details: 'Sync job created, processing pages...' })
      .eq('id', jobId);

    console.log(`✅ Created sync job ${jobId} with initial page queue job ${pageJob.id}`);

    return new Response(JSON.stringify({
      message: "Sync job created successfully",
      jobId: jobId,
      pageJobId: pageJob.id
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 202 // Accepted
    });

  } catch (error) {
    console.error('❌ Error in sync-threads-orchestrator:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});

