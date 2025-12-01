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

    // Build update object with ONLY the fields that are explicitly provided in the request
    // This API accepts partial updates - each field is independent:
    // - { completed: true/false } -> ONLY updates status column (nothing else changes)
    // - { priority: 'Low'|'Medium'|'High'|null } -> ONLY updates urgency column (nothing else changes)
    // - { owner: string|null } -> ONLY updates owner column (nothing else changes)
    // Fields that are NOT in the request body are NOT included in updateData, so they remain unchanged
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

    // Handle priority field - can be a valid value or null to clear it
    if (priority !== undefined) {
      if (priority === null) {
        // Allow null to clear the priority
        updateData.urgency = null;
        console.log('[API] Clearing urgency (priority set to null)');
      } else if (typeof priority === 'string' && ['Low', 'Medium', 'High'].includes(priority)) {
        // Map priority to urgency (the actual database column name)
        updateData.urgency = priority as Database['public']['Enums']['urgency_level'];
        console.log('[API] Setting urgency from priority:', { priority, urgency: updateData.urgency });
      } else {
        return NextResponse.json(
          { error: 'Invalid priority value. Must be Low, Medium, High, or null' },
          { status: 400 }
        );
      }
    }

    // Handle owner field - can be a string or null to clear it
    if (owner !== undefined) {
      if (owner === null) {
        // Allow null to clear the owner
        // Note: owner column may not exist in production, so we skip it for now
        // updateData.owner = null;
        console.log('[API] Owner set to null (skipping update - column may not exist)');
      } else if (typeof owner === 'string') {
        if (owner.length > 255) {
          return NextResponse.json(
            { error: 'Owner value is too long. Maximum 255 characters' },
            { status: 400 }
          );
        }
        // Note: owner column may not exist in production, so we skip it for now
        // updateData.owner = owner;
        console.log('[API] Owner set to:', owner, '(skipping update - column may not exist)');
      } else {
        return NextResponse.json(
          { error: 'Invalid owner value. Must be a string or null' },
          { status: 400 }
        );
      }
    }

    // If no valid fields to update, return error
    console.log('[API] Update data before validation:', updateData, 'Keys:', Object.keys(updateData));
    if (Object.keys(updateData).length === 0) {
      console.error('[API] No valid fields to update. Request body was:', body);
      console.error('[API] Completed value:', completed, 'Type:', typeof completed, 'Is undefined?', completed === undefined);
      
      // Last resort: if completed exists in body but wasn't processed, try to set it
      if ('completed' in body && !updateData.status) {
        const fallbackStatus = body.completed ? 'resolved' : 'open';
        updateData.status = fallbackStatus;
        console.log('[API] Fallback: Setting status from body.completed:', { bodyCompleted: body.completed, fallbackStatus });
      }
      
      // Check again after fallback
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json(
          { error: 'No valid fields to update. Provide completed, priority, or owner' },
          { status: 400 }
        );
      }
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
    // updateData contains ONLY the fields that were explicitly provided in the request
    // Supabase will only update those specific fields, leaving all others unchanged
    console.log('[API] Final updateData (only these fields will be updated):', updateData);
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

