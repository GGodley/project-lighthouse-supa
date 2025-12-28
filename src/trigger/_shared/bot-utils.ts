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
    const response = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // 404 means bot already deleted - this is fine
    if (response.status === 404) {
      return {
        success: true,
        deleted: false, // Already deleted
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        deleted: false,
        error: errorText,
        statusCode: response.status,
      };
    }

    return {
      success: true,
      deleted: true,
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
    const recallPayload = {
      meeting_url: meetingUrl,
      join_at: joinAt,
      recording_config: {
        transcript: {
          provider: { gladia_v2_streaming: {} },
          webhook_url: webhookUrl,
        },
      },
    };

    const response = await fetch('https://us-west-2.recall.ai/api/v1/bot', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recallPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: errorText,
        statusCode: response.status,
      };
    }

    const recallData = await response.json();
    const botId = recallData.id;

    if (!botId) {
      return {
        success: false,
        error: 'No bot ID returned from Recall.ai API',
      };
    }

    return {
      success: true,
      botId: botId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

