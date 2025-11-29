import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { Database } from '@/types/database';

type FeatureRequestUpdate = Database['public']['Tables']['feature_requests']['Update'];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { completed, priority, owner } = body;

    // Build update object with only provided fields
    const updateData: Partial<FeatureRequestUpdate> = {};

    if (typeof completed === 'boolean') {
      updateData.completed = completed;
    }

    if (priority !== undefined) {
      // Validate priority values
      if (!['Low', 'Medium', 'High'].includes(priority)) {
        return NextResponse.json(
          { error: 'Invalid priority value. Must be Low, Medium, or High' },
          { status: 400 }
        );
      }
      updateData.urgency = priority;
    }

    if (owner !== undefined) {
      // Validate owner is a string and not too long
      if (typeof owner !== 'string' && owner !== null) {
        return NextResponse.json(
          { error: 'Invalid owner value. Must be a string or null' },
          { status: 400 }
        );
      }
      if (owner && owner.length > 255) {
        return NextResponse.json(
          { error: 'Owner value is too long. Maximum 255 characters' },
          { status: 400 }
        );
      }
      updateData.owner = owner || null;
    }

    // If no valid fields to update, return error
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update. Provide completed, priority, or owner' },
        { status: 400 }
      );
    }

    // Verify the feature request belongs to the user's company
    // First, get the feature request with its company_id
    const { data: featureRequest, error: fetchError } = await supabase
      .from('feature_requests')
      .select('id, company_id')
      .eq('id', id)
      .single();

    if (fetchError || !featureRequest) {
      return NextResponse.json(
        { error: 'Feature request not found' },
        { status: 404 }
      );
    }

    // Verify the company belongs to the user
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('user_id')
      .eq('company_id', featureRequest.company_id)
      .eq('user_id', user.id)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: 'Feature request not found or access denied' },
        { status: 404 }
      );
    }

    // Update the feature request
    const { data: updated, error: updateError } = await supabase
      .from('feature_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating feature request:', updateError);
      return NextResponse.json(
        { error: 'Failed to update feature request' },
        { status: 500 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error in PATCH /api/feature-requests/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

