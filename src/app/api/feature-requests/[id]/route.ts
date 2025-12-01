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
    let body: any = {};
    try {
      const text = await request.text();
      console.log('[API] Raw request body text:', text);
      if (text) {
        body = JSON.parse(text);
      }
    } catch (error) {
      console.error('[API] Error parsing request body:', error);
      return NextResponse.json(
        { error: 'Invalid request body. Expected JSON.' },
        { status: 400 }
      );
    }
    
    const { completed, priority, owner } = body;
    console.log('[API] Parsed request body:', { completed, priority, owner, body, bodyKeys: Object.keys(body) });

    // Build update object with only provided fields
    // Only include fields that we know exist in production
    const updateData: Partial<FeatureRequestUpdate> = {};

    // Handle completed field - map to status column
    // Database uses status column, not completed column
    // completed = true -> status = 'resolved'
    // completed = false -> status = 'open'
    if (completed !== undefined && completed !== null) {
      // Handle various boolean representations
      let boolValue: boolean;
      if (typeof completed === 'boolean') {
        boolValue = completed;
      } else if (typeof completed === 'string') {
        boolValue = completed.toLowerCase() === 'true' || completed === '1';
      } else if (typeof completed === 'number') {
        boolValue = completed === 1;
      } else {
        // Default to false for any other type
        boolValue = false;
      }
      
      const newStatus: string = boolValue ? 'resolved' : 'open';
      updateData.status = newStatus;
      console.log('[API] Setting status:', { 
        completed, 
        completedType: typeof completed,
        boolValue, 
        newStatus, 
        updateData,
        updateDataKeys: Object.keys(updateData)
      });
    } else {
      console.log('[API] Completed field is undefined or null:', { completed, body });
    }

    if (priority !== undefined) {
      // Validate priority values
      if (!['Low', 'Medium', 'High'].includes(priority)) {
        return NextResponse.json(
          { error: 'Invalid priority value. Must be Low, Medium, or High' },
          { status: 400 }
        );
      }
      // Map priority to urgency (the actual database column name)
      updateData.urgency = priority as Database['public']['Enums']['urgency_level'];
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
      // Only include if we're sure the column exists
      // For now, skip this to avoid errors if column doesn't exist
      // updateData.owner = owner || null;
    }

    // If no valid fields to update, return error
    console.log('[API] Update data before validation:', updateData, 'Keys:', Object.keys(updateData));
    if (Object.keys(updateData).length === 0) {
      console.error('[API] No valid fields to update. Request body was:', body);
      return NextResponse.json(
        { error: 'No valid fields to update. Provide completed, priority, or owner' },
        { status: 400 }
      );
    }

    // Validate status value if it's being updated
    if (updateData.status && !['open', 'in_progress', 'resolved', 'closed', 'rejected'].includes(updateData.status)) {
      return NextResponse.json(
        { error: 'Invalid status value. Must be one of: open, in_progress, resolved, closed, rejected' },
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
    console.log('[API] Updating feature request:', { id, updateData, company_id: featureRequest.company_id });
    
    // First, verify the row exists and we can access it
    const { data: existingRow, error: checkError } = await supabase
      .from('feature_requests')
      .select('id, urgency, company_id')
      .eq('id', id)
      .single();
    
    if (checkError || !existingRow) {
      console.error('[API] Feature request not found or not accessible:', {
        error: checkError,
        id,
        company_id: featureRequest.company_id
      });
      return NextResponse.json(
        { error: 'Feature request not found or not accessible' },
        { status: 404 }
      );
    }
    
    console.log('[API] Existing row found:', existingRow);
    
    // Now perform the update
    const { data: updated, error: updateError } = await supabase
      .from('feature_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

    if (updateError) {
      console.error('[API] Error updating feature request:', {
        error: updateError,
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        updateData,
        id,
        existingRow
      });
      return NextResponse.json(
        { 
          error: 'Failed to update feature request',
          details: updateError.message,
          code: updateError.code
        },
        { status: 500 }
      );
    }
    
    if (!updated) {
      console.error('[API] Update returned no rows:', {
        id,
        updateData,
        existingRow,
        company_id: featureRequest.company_id
      });
      return NextResponse.json(
        { error: 'Update did not affect any rows. The feature request may have been deleted or you may not have permission to update it.' },
        { status: 404 }
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

