import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const { id: companyId, stepId } = await context.params;
    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body - support partial updates
    const body = await request.json();
    const { description, owner, due_date, priority, status } = body;

    // Validate status value if provided
    if (status !== undefined) {
      const validStatuses = ['todo', 'in_progress', 'done', 'blocked'] as const;
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be one of: todo, in_progress, done, blocked' },
          { status: 400 }
        );
      }
    }

    // Validate priority if provided
    if (priority !== undefined) {
      const validPriorities = ['high', 'medium', 'low'] as const;
      if (!validPriorities.includes(priority)) {
        return NextResponse.json(
          { error: 'Invalid priority. Must be one of: high, medium, low' },
          { status: 400 }
        );
      }
    }

    // Verify the next step belongs to the company and user
    // Since next_steps links to threads or meetings, we need to verify via thread_company_link or meetings
    const { data: nextStep, error: fetchError } = await supabase
      .from('next_steps')
      .select('step_id, user_id, thread_id, meeting_id')
      .eq('step_id', stepId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !nextStep) {
      return NextResponse.json(
        { error: 'Next step not found or access denied' },
        { status: 404 }
      );
    }

    // Verify the next step is linked to the requested company
    // Check via thread_company_link if thread_id exists, or via meetings if meeting_id exists
    let isLinked = false;
    
    if (nextStep.thread_id) {
      const { data: companyLink, error: linkError } = await supabase
        .from('thread_company_link')
        .select('company_id')
        .eq('thread_id', nextStep.thread_id)
        .eq('company_id', companyId)
        .single();
      
      if (!linkError && companyLink) {
        isLinked = true;
      }
    } else if (nextStep.meeting_id) {
      // Check via meetings -> customers -> companies
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select('customers!inner(company_id)')
        .eq('google_event_id', nextStep.meeting_id)
        .single();
      
      if (!meetingError && meeting?.customers) {
        const customers = Array.isArray(meeting.customers) ? meeting.customers : [meeting.customers];
        isLinked = customers.some((c: { company_id: string }) => c.company_id === companyId);
      }
    }

    if (!isLinked) {
      return NextResponse.json(
        { error: 'Next step not found or access denied' },
        { status: 404 }
      );
    }

    // Build update object with only provided fields
    const updateData: {
      description?: string;
      owner?: string | null;
      due_date?: string | null;
      priority?: 'high' | 'medium' | 'low';
      status?: 'todo' | 'in_progress' | 'done' | 'blocked';
    } = {};

    if (description !== undefined) updateData.description = description;
    if (owner !== undefined) updateData.owner = owner || null;
    if (due_date !== undefined) updateData.due_date = due_date || null;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;

    // Update the next step
    const { data: updated, error: updateError } = await supabase
      .from('next_steps')
      .update(updateData)
      .eq('step_id', stepId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating next step:', updateError);
      return NextResponse.json(
        { error: 'Failed to update next step' },
        { status: 500 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error in PATCH /api/companies/[id]/next-steps/[stepId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

