// Edge Function to record monthly customer counts for all users
// This function should be called on the 1st of each month via cron job
// It records the previous month's customer count for all users

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log('📊 Starting monthly customer count recording...');

    // Get all users (from profiles table)
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .order('id', { ascending: true });

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    if (!profiles || profiles.length === 0) {
      console.log('ℹ️ No users found to process');
      return new Response(
        JSON.stringify({ message: 'No users found', recorded: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`📋 Found ${profiles.length} users to process`);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each user
    for (const profile of profiles) {
      try {
        // Call the database function to record previous month's count
        // This function is called on the 1st of each month to record the previous month
        const { data, error } = await supabaseAdmin.rpc('record_monthly_customer_count', {
          p_user_id: profile.id,
          p_record_previous_month: true
        });

        if (error) {
          console.error(`❌ Error recording count for user ${profile.id}:`, error.message);
          errorCount++;
          errors.push(`User ${profile.id}: ${error.message}`);
        } else {
          successCount++;
          console.log(`✅ Recorded count for user ${profile.id}: ${data || 'N/A'}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`❌ Exception recording count for user ${profile.id}:`, errorMessage);
        errorCount++;
        errors.push(`User ${profile.id}: ${errorMessage}`);
      }
    }

    const result = {
      message: 'Monthly customer count recording completed',
      totalUsers: profiles.length,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log(`✅ Recording complete: ${successCount} successful, ${errorCount} errors`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('❌ Fatal error in monthly customer count recording:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

