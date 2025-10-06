import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
  transcript_id: string
  status: 'completed' | 'error'
  text?: string
  summary?: string
  highlights?: Array<{
    text: string
    start: number
    end: number
    confidence: number
  }>
  sentiment_analysis_results?: Array<{
    text: string
    start: number
    end: number
    confidence: number
    sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  }>
  entities?: Array<{
    text: string
    entity_type: string
    start: number
    end: number
  }>
  iab_categories?: {
    results: Array<{
      label: string
      confidence: number
    }>
  }
  utterances?: Array<{
    speaker: string
    text: string
    start: number
    end: number
    confidence: number
  }>
  error?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse webhook payload
    const payload: WebhookPayload = await req.json()
    
    console.log('Received webhook for transcript:', payload.transcript_id)

    // Find the transcription job
    const { data: transcriptionJob, error: jobError } = await supabaseClient
      .from('transcription_jobs')
      .select('*')
      .eq('assemblyai_id', payload.transcript_id)
      .single()

    if (jobError || !transcriptionJob) {
      console.error('Transcription job not found:', jobError)
      return new Response(
        JSON.stringify({ error: 'Transcription job not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update transcription job with results
    const updateData: any = {
      status: payload.status,
      updated_at: new Date().toISOString(),
    }

    if (payload.status === 'completed') {
      updateData.transcript_text = payload.text
      updateData.summary = payload.summary
      updateData.highlights = payload.highlights
      updateData.sentiment_analysis = payload.sentiment_analysis_results
      updateData.entities = payload.entities
      updateData.iab_categories = payload.iab_categories
      updateData.utterances = payload.utterances
      updateData.completed_at = new Date().toISOString()
    } else if (payload.status === 'error') {
      updateData.error_message = payload.error
      updateData.failed_at = new Date().toISOString()
    }

    // Update the transcription job
    const { error: updateError } = await supabaseClient
      .from('transcription_jobs')
      .update(updateData)
      .eq('id', transcriptionJob.id)

    if (updateError) {
      console.error('Failed to update transcription job:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update transcription job' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // If transcription is completed and we have a meeting_id, update the meeting record
    if (payload.status === 'completed' && transcriptionJob.meeting_id) {
      const meetingUpdateData: any = {
        summary: payload.summary,
        transcript: payload.text,
        sentiment: payload.sentiment_analysis_results?.[0]?.sentiment?.toLowerCase() || 'neutral',
        topics: payload.iab_categories?.results?.map(cat => cat.label) || [],
        updated_at: new Date().toISOString(),
      }

      const { error: meetingUpdateError } = await supabaseClient
        .from('meetings')
        .update(meetingUpdateData)
        .eq('id', transcriptionJob.meeting_id)

      if (meetingUpdateError) {
        console.error('Failed to update meeting record:', meetingUpdateError)
      }
    }

    console.log('Webhook processed successfully for transcript:', payload.transcript_id)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook processed successfully' 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Webhook processing error:', error)
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
