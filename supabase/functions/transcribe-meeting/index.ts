import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TranscribeRequest {
  audio_url: string
  meeting_id?: string
  customer_id?: string
  user_id: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the user from the request
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse request body
    const { audio_url, meeting_id, customer_id, user_id }: TranscribeRequest = await req.json()

    if (!audio_url) {
      return new Response(
        JSON.stringify({ error: 'audio_url is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Start transcription using AssemblyAI REST API
    const assemblyaiResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': Deno.env.get('ASSEMBLYAI_API_KEY')!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audio_url,
        webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/transcription-webhook`,
        webhook_auth_header_name: 'Authorization',
        webhook_auth_header_value: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        speaker_labels: true,
        speakers_expected: 2,
        auto_highlights: true,
        sentiment_analysis: true,
        entity_detection: true,
        iab_categories: true,
        language_detection: true,
        summarization: true,
        summary_model: 'informative',
        summary_type: 'bullets',
      }),
    })

    if (!assemblyaiResponse.ok) {
      throw new Error(`AssemblyAI API error: ${assemblyaiResponse.statusText}`)
    }

    const transcript = await assemblyaiResponse.json()

    // Store transcription job in database
    const { data: transcriptionJob, error: dbError } = await supabaseClient
      .from('transcription_jobs')
      .insert({
        assemblyai_id: transcript.id,
        user_id: user_id,
        meeting_id: meeting_id,
        customer_id: customer_id,
        audio_url: audio_url,
        status: 'processing',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(
        JSON.stringify({ error: 'Failed to store transcription job' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        transcription_id: transcript.id,
        job_id: transcriptionJob.id,
        status: 'processing',
        message: 'Transcription started successfully'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Transcription error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
