// Shared utility functions for feature request persistence
// This provides a single source of truth for saving feature requests across all extraction points

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface FeatureRequest {
  feature_title: string;
  request_details: string;
  urgency: 'Low' | 'Medium' | 'High';
}

export interface FeatureRequestContext {
  company_id: string;
  customer_id: string;
  source: 'email' | 'meeting' | 'thread';
  email_id?: number | null;
  meeting_id?: number | null;
  thread_id?: string | null;
}

export interface SaveFeatureRequestsResult {
  success: boolean;
  savedCount: number;
  errors: Array<{ feature_title: string; error: string }>;
}

/**
 * Saves feature requests to the database
 * Handles feature upsert and feature_request insert with proper error handling
 * 
 * @param supabaseClient - Supabase client with service role key
 * @param featureRequests - Array of feature requests to save
 * @param context - Context information (company_id, customer_id, source, source_id)
 * @returns Result object with success status, saved count, and any errors
 */
export async function saveFeatureRequests(
  supabaseClient: SupabaseClient,
  featureRequests: FeatureRequest[],
  context: FeatureRequestContext
): Promise<SaveFeatureRequestsResult> {
  const result: SaveFeatureRequestsResult = {
    success: true,
    savedCount: 0,
    errors: []
  };

  if (!featureRequests || featureRequests.length === 0) {
    return result;
  }

  // Validation: Ensure company_id and customer_id are valid
  if (!context.company_id || typeof context.company_id !== 'string') {
    const errorMsg = `Invalid company_id: ${context.company_id}`;
    console.error(`❌ [FEATURE_REQUEST_UTILS] ${errorMsg}`);
    result.success = false;
    result.errors = featureRequests.map(req => ({
      feature_title: req.feature_title || 'Unknown',
      error: errorMsg
    }));
    return result;
  }

  if (!context.customer_id || typeof context.customer_id !== 'string') {
    const errorMsg = `Invalid customer_id: ${context.customer_id}`;
    console.error(`❌ [FEATURE_REQUEST_UTILS] ${errorMsg}`);
    result.success = false;
    result.errors = featureRequests.map(req => ({
      feature_title: req.feature_title || 'Unknown',
      error: errorMsg
    }));
    return result;
  }

  console.log(`Saving ${featureRequests.length} feature requests for ${context.source} source`);
  
  // Log context details for debugging thread_id issues
  if (context.source === 'thread') {
    console.log(`🔍 [FEATURE_REQUEST_DEBUG] Received context for thread source:`, {
      source: context.source,
      thread_id: context.thread_id,
      thread_idType: typeof context.thread_id,
      thread_idIsString: typeof context.thread_id === 'string',
      thread_idIsNull: context.thread_id === null,
      thread_idIsUndefined: context.thread_id === undefined,
      thread_idTruthy: !!context.thread_id,
      company_id: context.company_id,
      customer_id: context.customer_id
    });
  }

  for (const req of featureRequests) {
    try {
      // Validate feature request
      if (!req.feature_title || !req.request_details || !req.urgency) {
        throw new Error('Missing required fields: feature_title, request_details, or urgency');
      }

      // Validate urgency value
      if (!['Low', 'Medium', 'High'].includes(req.urgency)) {
        throw new Error(`Invalid urgency value: ${req.urgency}. Must be Low, Medium, or High`);
      }

      // Step 1: Check if feature exists by title (case-sensitive exact match)
      const { data: existingFeature, error: checkError } = await supabaseClient
        .from('features')
        .select('id, first_requested, last_requested')
        .eq('title', req.feature_title)
        .maybeSingle();

      if (checkError) {
        throw new Error(`Failed to check for existing feature: ${checkError.message}`);
      }

      let featureData;
      const now = new Date().toISOString();

      if (existingFeature) {
        // Feature exists - update last_requested, keep existing first_requested
        const { data: updatedFeature, error: updateError } = await supabaseClient
          .from('features')
          .update({ last_requested: now })
          .eq('id', existingFeature.id)
          .select('id')
          .single();

        if (updateError || !updatedFeature) {
          throw new Error(`Failed to update feature: ${updateError?.message || 'No data returned'}`);
        }

        featureData = updatedFeature;
      } else {
        // New feature - create with both first_requested and last_requested set to now
        const { data: newFeature, error: insertError } = await supabaseClient
          .from('features')
          .insert({ 
            title: req.feature_title,
            first_requested: now,
            last_requested: now
          })
          .select('id')
          .single();

        if (insertError || !newFeature) {
          throw new Error(`Failed to create feature: ${insertError?.message || 'No data returned'}`);
        }

        featureData = newFeature;
      }

      // Step 2: Build insert payload based on source type
      const insertPayload: any = {
        company_id: context.company_id,
        customer_id: context.customer_id,
        feature_id: featureData.id,
        request_details: req.request_details,
        urgency: req.urgency,
        source: context.source,
        status: 'open' // Default status
      };

      // Add source-specific ID
      if (context.source === 'email' && context.email_id) {
        insertPayload.email_id = context.email_id;
      } else if (context.source === 'meeting' && context.meeting_id) {
        insertPayload.meeting_id = context.meeting_id;
      } else if (context.source === 'thread') {
        // Fixed: Always attempt to set thread_id when source is 'thread', with validation
        if (context.thread_id && typeof context.thread_id === 'string') {
          insertPayload.thread_id = context.thread_id;
          console.log(`✅ [FEATURE_REQUEST_DEBUG] Set thread_id: ${context.thread_id} for feature "${req.feature_title}"`);
        } else {
          console.error(`⚠️ [FEATURE_REQUEST_DEBUG] CRITICAL: thread_id is missing or invalid for thread source!`, {
            thread_id: context.thread_id,
            thread_idType: typeof context.thread_id,
            thread_idIsNull: context.thread_id === null,
            thread_idIsUndefined: context.thread_id === undefined,
            feature_title: req.feature_title,
            fullContext: JSON.stringify(context, null, 2)
          });
          // Still set it to allow debugging, but log the issue
          insertPayload.thread_id = context.thread_id || null;
        }
      }

      // Log insertPayload before database insert
      console.log(`🔍 [FEATURE_REQUEST_DEBUG] Insert payload for "${req.feature_title}":`, {
        company_id: insertPayload.company_id,
        customer_id: insertPayload.customer_id,
        feature_id: insertPayload.feature_id,
        source: insertPayload.source,
        thread_id: insertPayload.thread_id,
        email_id: insertPayload.email_id,
        meeting_id: insertPayload.meeting_id,
        urgency: insertPayload.urgency
      });

      // Step 3: Insert Feature Request
      const { data: insertedData, error: requestError } = await supabaseClient
        .from('feature_requests')
        .insert(insertPayload)
        .select('id, thread_id, source');

      // Log database response
      if (requestError) {
        console.error(`❌ [FEATURE_REQUEST_DEBUG] Database insert error:`, {
          error: requestError.message,
          code: requestError.code,
          details: requestError.details,
          hint: requestError.hint,
          insertPayload: JSON.stringify(insertPayload, null, 2)
        });
      } else if (insertedData && insertedData.length > 0) {
        console.log(`✅ [FEATURE_REQUEST_DEBUG] Database insert successful:`, {
          inserted_id: insertedData[0].id,
          inserted_thread_id: insertedData[0].thread_id,
          inserted_source: insertedData[0].source,
          expected_thread_id: insertPayload.thread_id
        });
      }

      if (requestError) {
        throw new Error(`Failed to insert feature request: ${requestError.message}`);
      }

      result.savedCount++;
      console.log(`Successfully saved feature request: ${req.feature_title} (${req.urgency})`);

    } catch (error: any) {
      result.success = false;
      result.errors.push({
        feature_title: req.feature_title || 'Unknown',
        error: error.message || 'Unknown error'
      });
      console.error(`Error processing feature request "${req.feature_title}":`, error.message);
      // Continue processing other requests even if one fails
    }
  }

  if (result.errors.length > 0) {
    console.warn(`Completed with ${result.errors.length} errors out of ${featureRequests.length} requests`);
  } else {
    console.log(`✅ Successfully saved all ${result.savedCount} feature requests`);
  }

  return result;
}

