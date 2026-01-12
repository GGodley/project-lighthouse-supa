// Bot management utilities for Recall.ai integration

export type DeleteBotResult = {
  success: boolean;
  deleted: boolean;
  error?: string;
  statusCode?: number;
};

export type CreateBotResult = {
  success: boolean;
  botId?: string;
  error?: string;
  statusCode?: number;
};

/**
 * Deletes a bot from Recall.ai
 * @param botId The bot ID to delete
 * @param apiKey Recall.ai API key
 * @returns Result with success status
 */
export async function deleteBotFromRecall(
  botId: string,
  apiKey: string
): Promise<DeleteBotResult> {
  try {
    console.log(`[DELETE-BOT] Attempting to delete bot ${botId} from Recall.ai`)
    
    // Add trailing slash as required by Recall.ai API
    const deleteUrl = `https://us-west-2.recall.ai/api/v1/bot/${botId}/`
    console.log(`[DELETE-BOT] DELETE ${deleteUrl}`)
    
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`[DELETE-BOT] Response status: ${response.status} ${response.statusText}`)

    // 204 No Content or 200 OK means success
    if (response.ok || response.status === 204) {
      console.log(`[DELETE-BOT] Successfully deleted bot ${botId}`)
      return {
        success: true,
        deleted: true,
        statusCode: response.status,
      };
    }

    // 404 means bot already deleted - this is fine
    if (response.status === 404) {
      console.log(`[DELETE-BOT] Bot ${botId} was already deleted (404)`)
      return {
        success: true,
        deleted: false, // Already deleted
        statusCode: 404,
      };
    }

    // 405 means bot is already dispatched - try to remove it from call instead
    if (response.status === 405) {
      console.log(`[DELETE-BOT] Bot ${botId} is dispatched (405), attempting to remove from call`)
      const removeResult = await removeBotFromCall(botId, apiKey)
      if (removeResult.success) {
        console.log(`[DELETE-BOT] Successfully removed bot ${botId} from call`)
        return {
          success: true,
          deleted: true,
          statusCode: 200, // Treat as success
        };
      }
      // If remove also fails, return the original error
      const errorText = await response.text().catch(() => 'Method Not Allowed - bot is dispatched')
      console.error(`[DELETE-BOT] Failed to remove bot ${botId} from call: ${removeResult.error}`)
      return {
        success: false,
        deleted: false,
        error: errorText,
        statusCode: response.status,
      };
    }

    // For other errors, get error text
    const errorText = await response.text().catch(() => `HTTP ${response.status}`)
    console.error(`[DELETE-BOT] Failed to delete bot ${botId}: ${response.status} - ${errorText}`)
    return {
      success: false,
      deleted: false,
      error: errorText,
      statusCode: response.status,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[DELETE-BOT] Exception deleting bot ${botId}:`, errorMessage)
    return {
      success: false,
      deleted: false,
      error: errorMessage,
    };
  }
}

/**
 * Removes a bot from an active call (when bot is already dispatched)
 * @param botId The bot ID to remove
 * @param apiKey Recall.ai API key
 * @returns Result with success status
 */
async function removeBotFromCall(
  botId: string,
  apiKey: string
): Promise<DeleteBotResult> {
  try {
    // Use the remove_bot_from_call endpoint
    const removeUrl = `https://us-west-2.recall.ai/api/v1/bot/${botId}/remove_bot_from_call/`
    console.log(`[REMOVE-BOT] POST ${removeUrl}`)
    
    const response = await fetch(removeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`[REMOVE-BOT] Response status: ${response.status} ${response.statusText}`)

    if (response.ok || response.status === 204) {
      return {
        success: true,
        deleted: true,
        statusCode: response.status,
      };
    }

    const errorText = await response.text().catch(() => `HTTP ${response.status}`)
    return {
      success: false,
      deleted: false,
      error: errorText,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      success: false,
      deleted: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Creates a bot in Recall.ai
 * @param meetingUrl The meeting URL (Google Meet, Zoom, or Teams)
 * @param joinAt UTC ISO string for when bot should join (1 minute before start)
 * @param webhookUrl Webhook URL for transcript processing
 * @param apiKey Recall.ai API key
 * @returns Result with bot ID on success
 */
export async function createBotInRecall(
  meetingUrl: string,
  joinAt: string,
  webhookUrl: string,
  apiKey: string
): Promise<CreateBotResult> {
  try {
    console.log(`[CREATE-BOT] Creating bot for meeting URL: ${meetingUrl}, join_at: ${joinAt}`)
    
    // Get transcription provider from environment variable
    // Defaults to 'gladia_v2_streaming' if not set
    // Options: 'gladia_v2_streaming', 'deepgram', 'assembly_ai', or set to empty string for Recall.ai default
    // Note: Gladia credentials must be configured in Recall.ai dashboard: https://us-west-2.recall.ai/dashboard/transcription
    const transcriptionProvider = process.env.RECALL_TRANSCRIPTION_PROVIDER?.trim() || 'gladia_v2_streaming';
    
    // Build recording config based on provider
    const recordingConfig: {
      transcript: {
        provider?: Record<string, Record<string, never>>;
        webhook_url: string;
      };
    } = {
      transcript: {
        webhook_url: webhookUrl,
        ...(transcriptionProvider && {
          provider: {
            [transcriptionProvider]: {},
          },
        }),
      },
    };

    const recallPayload = {
      meeting_url: meetingUrl,
      join_at: joinAt,
      recording_config: recordingConfig,
    };

    const createUrl = 'https://us-west-2.recall.ai/api/v1/bot'
    console.log(`[CREATE-BOT] POST ${createUrl}`)
    console.log(`[CREATE-BOT] Payload:`, JSON.stringify(recallPayload, null, 2))

    const response = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recallPayload),
    });

    console.log(`[CREATE-BOT] Response status: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`)
      console.error(`[CREATE-BOT] Failed to create bot: ${response.status} - ${errorText}`)
      return {
        success: false,
        error: errorText,
        statusCode: response.status,
      };
    }

    const recallData = await response.json()
    const botId = recallData.id

    if (!botId) {
      console.error(`[CREATE-BOT] No bot ID in response:`, recallData)
      return {
        success: false,
        error: 'No bot ID returned from Recall.ai API',
      };
    }

    console.log(`[CREATE-BOT] Successfully created bot ${botId}`)
    return {
      success: true,
      botId: botId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[CREATE-BOT] Exception creating bot:`, errorMessage)
    return {
      success: false,
      error: errorMessage,
    };
  }
}

