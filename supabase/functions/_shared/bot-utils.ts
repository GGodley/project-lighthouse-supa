// Utility functions for Recall.ai bot operations

export type DeleteBotResult = {
  success: boolean
  deleted: boolean
  error?: string
  statusCode?: number
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validates if a string is a valid UUID format
 */
export function isValidUUID(str: string | null | undefined): boolean {
  if (!str) return false
  return UUID_REGEX.test(str)
}

/**
 * Validates if a bot ID is in valid format
 */
export function isValidBotId(botId: string | null | undefined): boolean {
  return isValidUUID(botId)
}

/**
 * Deletes a Recall.ai bot with retry logic and exponential backoff
 * @param botId The bot ID to delete
 * @param recallApiKey The Recall.ai API key
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @returns Result object with success status and details
 */
export async function deleteBotWithRetry(
  botId: string,
  recallApiKey: string,
  maxRetries: number = 3
): Promise<DeleteBotResult> {
  // Validate bot ID format
  if (!isValidBotId(botId)) {
    return {
      success: false,
      deleted: false,
      error: `Invalid bot ID format: ${botId}`
    }
  }

  const baseUrl = 'https://us-west-2.recall.ai/api/v1'
  const deleteUrl = `${baseUrl}/bot/${botId}/`

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Token ${recallApiKey}`,
          'Content-Type': 'application/json',
        },
      })

      // 204 No Content or 200 OK means success
      if (response.ok || response.status === 204) {
        return {
          success: true,
          deleted: true,
          statusCode: response.status
        }
      }

      // 404 means bot was already deleted - treat as success
      if (response.status === 404) {
        return {
          success: true,
          deleted: false,
          statusCode: 404,
          error: 'Bot already deleted or not found'
        }
      }

      // For other errors, get error text and retry if not last attempt
      const errorText = await response.text()
      const error = `HTTP ${response.status}: ${errorText}`

      if (attempt === maxRetries) {
        return {
          success: false,
          deleted: false,
          error,
          statusCode: response.status
        }
      }

      // Exponential backoff: wait 1s, 2s, 4s...
      const delayMs = Math.pow(2, attempt - 1) * 1000
      console.warn(`⚠️ Bot deletion attempt ${attempt}/${maxRetries} failed: ${error}. Retrying in ${delayMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)

      if (attempt === maxRetries) {
        return {
          success: false,
          deleted: false,
          error: `Network error after ${maxRetries} attempts: ${error}`
        }
      }

      // Exponential backoff for network errors
      const delayMs = Math.pow(2, attempt - 1) * 1000
      console.warn(`⚠️ Bot deletion attempt ${attempt}/${maxRetries} network error: ${error}. Retrying in ${delayMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    success: false,
    deleted: false,
    error: 'Max retries exceeded'
  }
}



