import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Parse request body
    const { source_type, source_id } = await req.json();

    if (!source_type || !source_id) {
      return new Response(
        JSON.stringify({ error: "Missing source_type or source_id" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (source_type !== 'thread' && source_type !== 'meeting') {
      return new Response(
        JSON.stringify({ error: "Invalid source_type. Must be 'thread' or 'meeting'" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing next steps for ${source_type}: ${source_id}`);

    let nextSteps: Array<{ text: string; owner: string | null; due_date: string | null }> = [];
    let companyIds: string[] = [];
    let userId: string | null = null;

    if (source_type === 'thread') {
      // Fetch thread and extract next steps
      const { data: thread, error: threadError } = await supabase
        .from('threads')
        .select('thread_id, user_id, llm_summary')
        .eq('thread_id', source_id)
        .single();

      if (threadError || !thread) {
        throw new Error(`Thread not found: ${threadError?.message || 'Unknown error'}`);
      }

      userId = thread.user_id;

      // Extract next steps from llm_summary
      if (thread.llm_summary && typeof thread.llm_summary === 'object') {
        const summary = thread.llm_summary as any;
        
        // Check for new structured format
        if (Array.isArray(summary.next_steps)) {
          nextSteps = summary.next_steps.map((step: any) => ({
            text: step.text || '',
            owner: step.owner || null,
            due_date: step.due_date || null
          })).filter((step: any) => step.text !== '');
        } 
        // Legacy format: single csm_next_step string
        else if (summary.csm_next_step && typeof summary.csm_next_step === 'string') {
          const text = summary.csm_next_step.trim();
          if (text) {
            nextSteps = [{ text, owner: null, due_date: null }];
          }
        }
      }

      // Get company IDs linked to this thread
      const { data: links, error: linksError } = await supabase
        .from('thread_company_link')
        .select('company_id')
        .eq('thread_id', source_id);

      if (linksError) {
        console.error('Error fetching thread company links:', linksError);
      } else if (links) {
        companyIds = links.map(link => link.company_id);
      }
    } else if (source_type === 'meeting') {
      // Fetch meeting and extract next steps
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select('google_event_id, user_id, customer_id, next_steps')
        .eq('google_event_id', source_id)
        .single();

      if (meetingError || !meeting) {
        throw new Error(`Meeting not found: ${meetingError?.message || 'Unknown error'}`);
      }

      userId = meeting.user_id;

      // Extract next steps from next_steps JSONB column
      if (meeting.next_steps) {
        if (Array.isArray(meeting.next_steps)) {
          nextSteps = meeting.next_steps.map((step: any) => ({
            text: step.text || '',
            owner: step.owner || null,
            due_date: step.due_date || null
          })).filter((step: any) => step.text !== '');
        } else if (typeof meeting.next_steps === 'string') {
          // Legacy string format
          const text = meeting.next_steps.trim();
          if (text) {
            nextSteps = [{ text, owner: null, due_date: null }];
          }
        }
      }

      // Get company ID from customer
      if (meeting.customer_id) {
        const { data: customer, error: customerError } = await supabase
          .from('customers')
          .select('company_id')
          .eq('customer_id', meeting.customer_id)
          .single();

        if (customerError) {
          console.error('Error fetching customer:', customerError);
        } else if (customer?.company_id) {
          companyIds = [customer.company_id];
        }
      }
    }

    if (!userId) {
      throw new Error("Could not determine user_id");
    }

    if (companyIds.length === 0) {
      console.log(`No companies found for ${source_type} ${source_id}. Skipping next steps insertion.`);
      return new Response(
        JSON.stringify({ message: "No companies linked, skipping", next_steps_count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert next steps for each company
    const inserts = [];
    for (const companyId of companyIds) {
      for (const step of nextSteps) {
        // Check for duplicates (same text and company, not completed)
        const { data: existing } = await supabase
          .from('next_steps')
          .select('id')
          .eq('company_id', companyId)
          .eq('text', step.text)
          .eq('source_type', source_type)
          .eq('source_id', source_id)
          .eq('completed', false)
          .limit(1);

        if (!existing || existing.length === 0) {
          inserts.push({
            company_id: companyId,
            text: step.text,
            owner: step.owner,
            due_date: step.due_date ? new Date(step.due_date).toISOString() : null,
            source_type: source_type,
            source_id: source_id,
            user_id: userId,
            completed: false
          });
        }
      }
    }

    if (inserts.length > 0) {
      const { error: insertError } = await supabase
        .from('next_steps')
        .insert(inserts);

      if (insertError) {
        throw new Error(`Failed to insert next steps: ${insertError.message}`);
      }

      console.log(`Inserted ${inserts.length} next steps for ${companyIds.length} company/companies`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        next_steps_count: inserts.length,
        companies_count: companyIds.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-next-steps:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

