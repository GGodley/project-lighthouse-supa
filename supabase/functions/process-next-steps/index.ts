import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Helper function to validate and normalize priority
function validatePriority(priority: any): 'high' | 'medium' | 'low' {
  if (priority === 'high' || priority === 'low' || priority === 'medium') {
    return priority;
  }
  return 'medium'; // fallback
}

// Helper function to resolve requestor from participants
function resolveRequestorFromParticipants(participants: Array<{ customer_id: string | null }>): string | null {
  const customerParticipants = participants.filter(p => p.customer_id !== null);
  if (customerParticipants.length > 0) {
    return customerParticipants[0].customer_id!;
  }
  return null;
}

// Helper function to resolve owner from participants
function resolveOwnerFromParticipants(
  ownerString: string | null,
  internalParticipants: Array<{ user_id: string; name: string | null; email: string | null }>,
  fallbackUserId: string
): string {
  if (!ownerString) {
    return fallbackUserId;
  }

  const ownerLower = ownerString.toLowerCase().trim();
  
  for (const participant of internalParticipants) {
    const name = participant.name?.toLowerCase() || '';
    const email = participant.email?.toLowerCase() || '';
    
    // Check if owner string matches name or email (case-insensitive, partial match)
    if (name.includes(ownerLower) || ownerLower.includes(name) || 
        email.includes(ownerLower) || ownerLower.includes(email)) {
      return participant.user_id;
    }
  }
  
  return fallbackUserId;
}

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

    let nextSteps: Array<{ text: string; owner: string | null; due_date: string | null; priority: 'high' | 'medium' | 'low' }> = [];
    let companyIds: string[] = [];
    let userId: string | null = null;
    let requestedByContactId: string | null = null;
    let participants: Array<{ customer_id: string | null; user_id: string | null; customer_name: string | null; profile_name: string | null; profile_email: string | null }> = [];

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

      // Step 2a: Fetch Participants with Names
      const { data: threadParticipants, error: participantsError } = await supabase
        .from('thread_participants')
        .select('customer_id, user_id')
        .eq('thread_id', source_id);

      if (participantsError) {
        console.error('Error fetching thread participants:', participantsError);
      } else if (threadParticipants && threadParticipants.length > 0) {
        // Get unique customer IDs and user IDs
        const customerIds = [...new Set(threadParticipants.map(tp => tp.customer_id).filter((id): id is string => Boolean(id)))];
        const userIds = [...new Set(threadParticipants.map(tp => tp.user_id).filter((id): id is string => Boolean(id)))];

        // Fetch customer names
        const customerMap = new Map<string, { name: string | null }>();
        if (customerIds.length > 0) {
          const { data: customers, error: customersError } = await supabase
            .from('customers')
            .select('customer_id, name, full_name')
            .in('customer_id', customerIds);

          if (customersError) {
            console.error('Error fetching customers:', customersError);
          } else if (customers) {
            for (const customer of customers) {
              customerMap.set(customer.customer_id, {
                name: customer.name || customer.full_name || null
              });
            }
          }
        }

        // Fetch profile names
        const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds);

          if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
          } else if (profiles) {
            for (const profile of profiles) {
              profileMap.set(profile.id, {
                full_name: profile.full_name,
                email: profile.email
              });
            }
          }
        }

        // Transform participants data
        participants = threadParticipants.map((tp) => {
          const customer = tp.customer_id ? customerMap.get(tp.customer_id) : null;
          const profile = tp.user_id ? profileMap.get(tp.user_id) : null;
          return {
            customer_id: tp.customer_id,
            user_id: tp.user_id,
            customer_name: customer?.name || null,
            profile_name: profile?.full_name || null,
            profile_email: profile?.email || null
          };
        });
      }

      // Step 2b: Determine Requestor
      requestedByContactId = resolveRequestorFromParticipants(participants);

      // Extract next steps from llm_summary
      if (thread.llm_summary && typeof thread.llm_summary === 'object') {
        const summary = thread.llm_summary as any;
        
        // Check for new structured format
        if (Array.isArray(summary.next_steps)) {
          nextSteps = summary.next_steps.map((step: any) => ({
            text: step.text || '',
            owner: step.owner || null,
            due_date: step.due_date || null,
            priority: validatePriority(step.priority)
          })).filter((step: any) => step.text !== '');
        } 
        // Legacy format: single csm_next_step string
        else if (summary.csm_next_step && typeof summary.csm_next_step === 'string') {
          const text = summary.csm_next_step.trim();
          if (text) {
            nextSteps = [{ text, owner: null, due_date: null, priority: 'medium' as const }];
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
        .select('google_event_id, user_id, customer_id, next_steps, attendees')
        .eq('google_event_id', source_id)
        .single();

      if (meetingError || !meeting) {
        throw new Error(`Meeting not found: ${meetingError?.message || 'Unknown error'}`);
      }

      userId = meeting.user_id;

      // Step 3: Fetch participants from meeting attendees
      const attendeeEmails: string[] = [];
      if (meeting.attendees) {
        if (Array.isArray(meeting.attendees)) {
          for (const attendee of meeting.attendees) {
            if (typeof attendee === 'string') {
              attendeeEmails.push(attendee);
            } else if (attendee && typeof attendee === 'object') {
              const email = (attendee as any).email;
              if (typeof email === 'string') {
                attendeeEmails.push(email);
              }
            }
          }
        }
      }

      // Match emails to customers and profiles
      if (attendeeEmails.length > 0) {
        // Get customers
        const { data: customers, error: customersError } = await supabase
          .from('customers')
          .select('customer_id, name, full_name, email')
          .in('email', attendeeEmails)
          .eq('user_id', userId);

        if (customersError) {
          console.error('Error fetching customers for meeting attendees:', customersError);
        } else if (customers) {
          for (const customer of customers) {
            participants.push({
              customer_id: customer.customer_id,
              user_id: null,
              customer_name: customer.name || customer.full_name || null,
              profile_name: null,
              profile_email: null
            });
          }
        }

        // Get internal users from profiles
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('email', attendeeEmails);

        if (profilesError) {
          console.error('Error fetching profiles for meeting attendees:', profilesError);
        } else if (profiles) {
          for (const profile of profiles) {
            participants.push({
              customer_id: null,
              user_id: profile.id,
              customer_name: null,
              profile_name: profile.full_name,
              profile_email: profile.email
            });
          }
        }
      }

      // Determine requestor: first customer from attendees
      requestedByContactId = resolveRequestorFromParticipants(participants);
      // If no customer found but meeting has customer_id, use that
      if (!requestedByContactId && meeting.customer_id) {
        requestedByContactId = meeting.customer_id;
      }

      // Extract next steps from next_steps JSONB column
      if (meeting.next_steps) {
        if (Array.isArray(meeting.next_steps)) {
          nextSteps = meeting.next_steps.map((step: any) => ({
            text: step.text || '',
            owner: step.owner || null,
            due_date: step.due_date || null,
            priority: validatePriority(step.priority)
          })).filter((step: any) => step.text !== '');
        } else if (typeof meeting.next_steps === 'string') {
          // Legacy string format
          const text = meeting.next_steps.trim();
          if (text) {
            nextSteps = [{ text, owner: null, due_date: null, priority: 'medium' as const }];
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

    // Step 2c & 2d: Determine owner and prepare inserts
    const internalParticipants = participants
      .filter(p => p.user_id !== null)
      .map(p => ({
        user_id: p.user_id!,
        name: p.profile_name,
        email: p.profile_email
      }));

    // Insert next steps for each company
    const inserts = [];
    for (const companyId of companyIds) {
      for (const step of nextSteps) {
        // Step 2c: Determine Owner (per next step)
        const assignedToUserId = resolveOwnerFromParticipants(
          step.owner,
          internalParticipants,
          userId!
        );

        // Check for duplicates (same text and company, not completed)
        const { data: existing } = await supabase
          .from('next_steps')
          .select('id')
          .eq('company_id', companyId)
          .eq('text', step.text)
          .eq('source_type', source_type)
          .eq('source_id', source_id)
          .eq('status', 'todo')
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
            requested_by_contact_id: requestedByContactId,
            assigned_to_user_id: assignedToUserId,
            priority: step.priority,
            status: 'todo'
          });
        }
      }
    }

    if (inserts.length > 0) {
      const { data: insertedSteps, error: insertError } = await supabase
        .from('next_steps')
        .insert(inserts)
        .select('step_id, id, source_type, source_id');

      if (insertError) {
        throw new Error(`Failed to insert next steps: ${insertError.message}`);
      }

      console.log(`Inserted ${inserts.length} next steps for ${companyIds.length} company/companies`);

      // Create assignments for each inserted next step
      if (insertedSteps && insertedSteps.length > 0) {
        const assignments: Array<{ next_step_id: string; customer_id: string }> = [];

        for (const step of insertedSteps) {
          // Handle both step_id and id column names
          const stepId = (step as any).step_id || (step as any).id;
          if (!stepId) {
            console.warn('Could not find step_id or id in inserted step:', step);
            continue;
          }

          // Use the participants we already fetched
          const customerIds = participants
            .filter(p => p.customer_id !== null)
            .map(p => p.customer_id!)
            .filter((id, index, self) => self.indexOf(id) === index); // distinct

          // Create assignments for each customer
          for (const customerId of customerIds) {
            assignments.push({
              next_step_id: stepId,
              customer_id: customerId
            });
          }
        }

        // Insert assignments in batch
        if (assignments.length > 0) {
          const { error: assignmentError } = await supabase
            .from('next_step_assignments')
            .insert(assignments);

          if (assignmentError) {
            console.error('Error inserting next step assignments:', assignmentError);
            // Don't throw - assignments are not critical for the main flow
          } else {
            console.log(`Created ${assignments.length} next step assignments`);
          }
        }
      }
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

