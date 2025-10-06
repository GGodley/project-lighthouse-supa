import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Get query parameters
    const url = new URL(req.url)
    const jobId = url.searchParams.get('job_id')
    const assemblyaiId = url.searchParams.get('assemblyai_id')
    const meetingId = url.searchParams.get('meeting_id')

    if (!jobId && !assemblyaiId && !meetingId) {
      return new Response(
        JSON.stringify({ error: 'job_id, assemblyai_id, or meeting_id is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Build query
    let query = supabaseClient
      .from('transcription_jobs')
      .select('*')
      .eq('user_id', user.id)

    if (jobId) {
      query = query.eq('id', jobId)
    } else if (assemblyaiId) {
      query = query.eq('assemblyai_id', assemblyaiId)
    } else if (meetingId) {
      query = query.eq('meeting_id', meetingId)
    }

    const { data: transcriptionJob, error: dbError } = await query.single()

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(
        JSON.stringify({ error: 'Transcription job not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Return the transcription job data
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: transcriptionJob.id,
          assemblyai_id: transcriptionJob.assemblyai_id,
          status: transcriptionJob.status,
          meeting_id: transcriptionJob.meeting_id,
          customer_id: transcriptionJob.customer_id,
          audio_url: transcriptionJob.audio_url,
          transcript_text: transcriptionJob.transcript_text,
          summary: transcriptionJob.summary,
          highlights: transcriptionJob.highlights,
          sentiment_analysis: transcriptionJob.sentiment_analysis,
          entities: transcriptionJob.entities,
          iab_categories: transcriptionJob.iab_categories,
          utterances: transcriptionJob.utterances,
          error_message: transcriptionJob.error_message,
          created_at: transcriptionJob.created_at,
          updated_at: transcriptionJob.updated_at,
          completed_at: transcriptionJob.completed_at,
          failed_at: transcriptionJob.failed_at,
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Get transcription status error:', error)
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
