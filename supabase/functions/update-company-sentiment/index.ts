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
    // Step 2: Add 30-Day Date Logic
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // Handle Authentication and Create Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? "",
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Parse and Validate Payload
    const { company_id } = await req.json();
    if (!company_id) {
      throw new Error('Missing company_id in request body');
    }

    // Logic Step 1: Query the vw_all_interactions View (last 30 days, non-neutral only)
    const { data: interactions, error: viewError } = await supabaseAdmin
      .from('vw_all_interactions')
      .select('interaction_date, sentiment_score')
      .eq('company_id', company_id)
      .gt('interaction_date', thirtyDaysAgoISO) // Only last 30 days
      .neq('sentiment_score', 0); // Ignore Neutral

    if (viewError) {
      throw new Error(`Failed to query view: ${viewError.message}`);
    }

    // 2. DATE QUERY: Get the single most recent interaction of ANY type.
    const { data: lastInteraction, error: dateError } = await supabaseAdmin
      .from('vw_all_interactions')
      .select('interaction_date')
      .eq('company_id', company_id)
      .order('interaction_date', { ascending: false })
      .limit(1);

    if (dateError) {
      throw new Error(`Failed to query for last date: ${dateError.message}`);
    }

    // Store the date (or null if none found at all)
    const lastInteractionDate = lastInteraction && lastInteraction.length > 0 
      ? lastInteraction[0].interaction_date 
      : null;

    // Logic Step 2: Handle "No Interactions" Case (no non-neutral interactions)
    if (!interactions || interactions.length === 0) {
      const { error: updateError } = await supabaseAdmin
        .from('companies')
        .update({
          overall_sentiment: 'Healthy',
          health_score: 0,
          last_interaction_at: lastInteractionDate // <-- This is the fix
        })
        .eq('company_id', company_id);

      if (updateError) {
        throw new Error(`Failed to update company: ${updateError.message}`);
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'No non-neutral interactions, set to Healthy.'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // Logic Step 3: Calculate the Net Sentiment Score by SUMMING all scores
    const finalHealthScore = interactions.reduce((acc, interaction) => {
      return acc + (interaction.sentiment_score ?? 0);
    }, 0);

    // Logic Step 4: Determine the final text status
    let finalSentimentStatus: 'Healthy' | 'At Risk';
    if (finalHealthScore < 0) { finalSentimentStatus = 'At Risk'; } else { finalSentimentStatus = 'Healthy'; }


    // Logic Step 5: Update the companies Table
    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({
        overall_sentiment: finalSentimentStatus,
        health_score: parseFloat(finalHealthScore.toFixed(2)),
        last_interaction_at: lastInteractionDate // <-- This is the fix
      })
      .eq('company_id', company_id);

    if (updateError) {
      throw new Error(`Failed to update company: ${updateError.message}`);
    }

    // Respond and Handle Errors
    console.log(`Successfully updated company ${company_id}: ${finalSentimentStatus} (${finalHealthScore.toFixed(2)})`);
    
    return new Response(JSON.stringify({
      success: true,
      company_id,
      sentiment_status: finalSentimentStatus,
      health_score: parseFloat(finalHealthScore.toFixed(2))
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (error) {
    console.error('update-company-sentiment error:', error.message);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
