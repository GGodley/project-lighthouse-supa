import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { OpenAI } from "https://esm.sh/openai@4.16.1";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
  try {
    const { record: job } = await req.json();
    console.log(`Generating summary for job ID: ${job.id}`);

    // Validate that we have the required job data
    if (!job || !job.id) {
      throw new Error('Invalid job data received - missing job ID');
    }

    const transcriptText = job.transcript_text;

    // --- Context Extraction ---
    // Let's assume meeting_url can serve as the title for now.
    const meetingTitle = job.meeting_url; 

    // Extract participant names from the 'utterances' JSON
    const attendees = new Set<string>();
    if (Array.isArray(job.utterances)) {
      job.utterances.forEach((p: any) => {
        if (p.participant?.name) {
          attendees.add(p.participant.name);
        }
      });
    }
    const attendeeList = Array.from(attendees).join(', ');
    console.log(`Context: Title='${meetingTitle}', Attendees='${attendeeList}'`);

    if (!transcriptText) {
      throw new Error(`Job ${job.id} has no transcript text to summarize.`);
    }

    // --- Construct the AI Prompt (UPGRADED) ---
    const prompt = `
      You are an expert Customer Success Manager assistant.
      Your task is to analyze a customer meeting transcript and provide a structured summary, key action items, and a detailed sentiment analysis.

      Context:
      - Meeting Title/URL: ${meetingTitle}
      - Meeting Attendees: ${attendeeList}

      Meeting Transcript:
      """
      ${transcriptText}
      """

      Instructions:
      Generate a response as a valid JSON object. The customer's sentiment is the most important part.
      Analyze the customer's words, tone, and feedback to determine their sentiment.

      Sentiment Categories & Scores:
      - "Very Positive" (Score: 3): Enthusiastic, explicit praise, clear plans for expansion.
      - "Positive" (Score: 2): Satisfied, complimentary, minor issues resolved, optimistic.
      - "Neutral" (Score: 0): No strong feelings, factual, informational, no complaints but no praise.
      - "Negative" (Score: -2): Frustrated, confused, mentioned blockers, unhappy with a feature or price.
      - "Frustrated" (Score: -3): Explicitly angry, threatening to churn, multiple major issues.

      Response Format:
      Return a valid JSON object with exactly four keys:
      
      "discussion_points": A string containing a concise summary of the main topics.
      
      "action_items": A string containing a bulleted list of tasks. If none, state "No action items were identified."
      
      "sentiment": A single string phrase chosen from the Sentiment Categories above (e.g., "Positive", "Negative").
      
      "sentiment_score": The numeric score (e.g., 2, -2) that corresponds to the chosen sentiment.
    `;

    // --- Call OpenAI API ---
    console.log("Sending prompt to OpenAI...");
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model: "gpt-4o" // UPGRADED from gpt-3.5-turbo
    });

    const responseContent = chatCompletion.choices[0].message.content;
    console.log("Received response from OpenAI.");

    // --- Update the Database ---
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`Updating transcription job with ID: ${job.id}`);
    console.log(`Job data structure:`, JSON.stringify(job, null, 2));

    const { error: updateError } = await supabaseClient
      .from('transcription_jobs')
      .update({
        summary_raw_response: responseContent ?? '',
        status: 'summary_received',
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Failed to update transcription job: ${updateError.message}`);
    }

    console.log(`Successfully updated transcription job ${job.id} with raw summary response.`);
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error("Error in generate-summary function:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
});