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
    const { completed } = body;

    if (typeof completed !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request body. completed must be a boolean' },
        { status: 400 }
      );
    }

    // Verify the next step belongs to the company and user
    const { data: nextStep, error: fetchError } = await supabase
      .from('next_steps')
      .select('id, company_id, user_id')
      .eq('id', stepId)
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !nextStep) {
      return NextResponse.json(
        { error: 'Next step not found or access denied' },
        { status: 404 }
      );
    }

    // Update the next step
    const { data: updated, error: updateError } = await supabase
      .from('next_steps')
      .update({ completed })
      .eq('id', stepId)
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

