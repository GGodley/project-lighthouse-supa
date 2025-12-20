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

    // Parse request body
    const body = await request.json();
    const { status } = body;

    // Validate status value
    const validStatuses = ['todo', 'in_progress', 'done'] as const;
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid request body. status must be one of: todo, in_progress, done' },
        { status: 400 }
      );
    }

    // Verify the next step belongs to the company and user
    // Since next_steps links to threads (not directly to companies), we need to verify via thread_company_link
    const { data: nextStep, error: fetchError } = await supabase
      .from('next_steps')
      .select('step_id, user_id, thread_id')
      .eq('step_id', stepId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !nextStep) {
      return NextResponse.json(
        { error: 'Next step not found or access denied' },
        { status: 404 }
      );
    }

    // Verify the thread is linked to the requested company
    const { data: companyLink, error: linkError } = await supabase
      .from('thread_company_link')
      .select('company_id')
      .eq('thread_id', nextStep.thread_id)
      .eq('company_id', companyId)
      .single();

    if (linkError || !companyLink) {
      return NextResponse.json(
        { error: 'Next step not found or access denied' },
        { status: 404 }
      );
    }

    // Update the next step
    const { data: updated, error: updateError } = await supabase
      .from('next_steps')
      .update({ status })
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

