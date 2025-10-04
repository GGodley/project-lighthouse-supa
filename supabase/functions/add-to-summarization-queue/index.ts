import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { emailIds } = await req.json()

    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'emailIds array is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    console.log(`📋 Adding ${emailIds.length} emails to summarization queue`)

    // Create summarization jobs for each email
    const jobs = emailIds.map((emailId: string) => ({
      email_id: emailId,
      status: 'pending'
    }))

    const { data, error } = await supabase
      .from('summarization_jobs')
      .insert(jobs)
      .select()

    if (error) {
      console.error('❌ Error creating summarization jobs:', error)
      throw error
    }

    console.log(`✅ Successfully created ${data.length} summarization jobs`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Added ${data.length} emails to summarization queue`,
        jobs: data
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('❌ Error in add-to-summarization-queue:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
