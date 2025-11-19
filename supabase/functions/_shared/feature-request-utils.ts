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

  console.log(`Saving ${featureRequests.length} feature requests for ${context.source} source`);

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

      // Step 1: Upsert Feature (create if doesn't exist, update if exists)
      const { data: featureData, error: featureError } = await supabaseClient
        .from('features')
        .upsert({ title: req.feature_title }, { onConflict: 'title' })
        .select('id')
        .single();

      if (featureError || !featureData) {
        throw new Error(`Failed to upsert feature: ${featureError?.message || 'No data returned'}`);
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
      } else if (context.source === 'thread' && context.thread_id) {
        insertPayload.thread_id = context.thread_id;
      }

      // Step 3: Insert Feature Request
      const { error: requestError } = await supabaseClient
        .from('feature_requests')
        .insert(insertPayload);

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

