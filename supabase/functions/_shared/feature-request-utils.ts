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
      // IMPORTANT: The source_id_check constraint requires that only the relevant source ID is set
      // and the others are explicitly null based on the source type
      // We use an explicit type (not Partial) to ensure all source IDs are always present (never undefined)
      type FeatureRequestInsert = {
        company_id: string;
        customer_id: string;
        feature_id: string;
        request_details: string | null;
        urgency: 'Low' | 'Medium' | 'High';
        source: 'email' | 'meeting' | 'thread';
        status: string;
        // CRITICAL: All three source IDs must always be present (never undefined)
        // The constraint requires explicit NULL values for non-relevant source IDs
        email_id: number | null;
        meeting_id: number | null;
        thread_id: string | null;
        completed?: boolean;
        owner?: string | null;
        requested_at?: string;
        updated_at?: string | null;
      };

      // Validate that the required source ID is present before building payload
      let email_id: number | null = null;
      let meeting_id: number | null = null;
      let thread_id: string | null = null;

      if (context.source === 'email') {
        if (!context.email_id) {
          throw new Error(`email_id is required when source is 'email'`);
        }
        email_id = context.email_id;
      } else if (context.source === 'meeting') {
        if (!context.meeting_id) {
          throw new Error(`meeting_id is required when source is 'meeting'`);
        }
        meeting_id = context.meeting_id;
      } else if (context.source === 'thread') {
        if (!context.thread_id || typeof context.thread_id !== 'string') {
          console.error(`⚠️ [FEATURE_REQUEST_DEBUG] CRITICAL: thread_id is missing or invalid for thread source!`, {
            thread_id: context.thread_id,
            thread_idType: typeof context.thread_id,
            thread_idIsNull: context.thread_id === null,
            thread_idIsUndefined: context.thread_id === undefined,
            feature_title: req.feature_title,
            fullContext: JSON.stringify(context, null, 2)
          });
          throw new Error(`thread_id is required when source is 'thread'`);
        }
        thread_id = context.thread_id;
        console.log(`✅ [FEATURE_REQUEST_DEBUG] Set thread_id: ${context.thread_id} for feature "${req.feature_title}"`);
      }

      // Build payload with all required fields
      // All three source IDs are explicitly set (relevant one has value, others are null)
      // This satisfies the source_id_check constraint which requires explicit NULL values
      // IMPORTANT: Ensure source is lowercase to match enum values exactly
      // The enum has: 'email', 'meeting', 'manual', 'Email', 'thread'
      // We use lowercase to match the constraint expectations
      const normalizedSource = context.source.toLowerCase() as 'email' | 'meeting' | 'thread';
      
      // Validate source is one of the expected values
      if (!['email', 'meeting', 'thread'].includes(normalizedSource)) {
        throw new Error(`Invalid source value: ${context.source}. Must be 'email', 'meeting', or 'thread'`);
      }
      
      const insertPayload: FeatureRequestInsert = {
        company_id: context.company_id,
        customer_id: context.customer_id,
        feature_id: featureData.id,
        request_details: req.request_details,
        urgency: req.urgency,
        source: normalizedSource, // Use normalized lowercase source to match enum
        status: 'open', // Default status
        // CRITICAL: All three source IDs must be explicitly set (never undefined)
        // The constraint requires explicit NULL values for non-relevant source IDs
        email_id: email_id,
        meeting_id: meeting_id,
        thread_id: thread_id,
      };

      // Validate all source IDs are explicitly set (not undefined)
      if (insertPayload.email_id === undefined || 
          insertPayload.meeting_id === undefined || 
          insertPayload.thread_id === undefined) {
        throw new Error('All source IDs must be explicitly set (null or value). This should never happen.');
      }

      // Log insertPayload before database insert
      // Log both the object and the JSON string to verify all fields are present
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
      
      // Log the actual JSON being sent to verify all fields (including nulls) are included
      console.log(`🔍 [FEATURE_REQUEST_DEBUG] Final payload JSON:`, JSON.stringify(insertPayload));

      // Step 3: Ensure thread exists if source is 'thread' (for foreign key constraint)
      // This is a robust solution that handles the case where threads are saved after feature requests
      if (context.source === 'thread' && insertPayload.thread_id) {
        // First, check if thread exists
        const { data: existingThread, error: threadCheckError } = await supabaseClient
          .from('threads')
          .select('thread_id')
          .eq('thread_id', insertPayload.thread_id)
          .maybeSingle();

        if (threadCheckError) {
          console.error(`❌ [FEATURE_REQUEST_DEBUG] Error checking thread existence:`, threadCheckError);
          throw new Error(`Failed to verify thread exists: ${threadCheckError.message}`);
        }

        if (!existingThread) {
          // Thread doesn't exist - this is a data integrity issue
          // In a robust system, we should either:
          // 1. Save the thread first (but we don't have thread data here)
          // 2. Skip this feature request and log a warning
          // 3. Make the foreign key constraint deferrable (handled in migration)
          
          // For now, we'll throw an error with a clear message
          // The calling code should ensure threads are saved before feature requests
          const errorMsg = `Thread ${insertPayload.thread_id} does not exist in threads table. Feature request cannot be saved until thread is created. Ensure threads are saved before feature requests.`;
          console.error(`❌ [FEATURE_REQUEST_DEBUG] ${errorMsg}`);
          throw new Error(errorMsg);
        }

        console.log(`✅ [FEATURE_REQUEST_DEBUG] Verified thread ${insertPayload.thread_id} exists before saving feature request`);
      }

      // Step 4: Insert Feature Request
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
          insertPayload: JSON.stringify(insertPayload, null, 2),
          sourceValue: insertPayload.source,
          sourceType: typeof insertPayload.source,
          threadIdValue: insertPayload.thread_id,
          threadIdType: typeof insertPayload.thread_id,
          threadIdIsNull: insertPayload.thread_id === null,
          threadIdIsUndefined: insertPayload.thread_id === undefined
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

