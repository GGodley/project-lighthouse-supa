// Shared utilities for thread processing across all stages
// Extracted from sync-threads to be reusable

// --- Gmail Payload Parsing ---

const decodeBase64Url = (data: string | undefined): string | undefined => {
  if (!data) return undefined;
  try {
    let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  } catch (e) {
    console.error("Base64 decoding failed for data chunk.", e);
    return undefined;
  }
};

const collectBodies = (payload: any): { text?: string, html?: string } => {
  let text: string | undefined;
  let html: string | undefined;
  const partsToVisit = [payload, ...payload?.parts || []];
  const findParts = (parts: any[]) => {
    for (const part of parts) {
      if (part?.body?.data) {
        const mimeType = part.mimeType || '';
        const decodedData = decodeBase64Url(part.body.data);
        if (decodedData) {
          if (mimeType === 'text/plain' && !text) {
            text = decodedData;
          }
          if (mimeType === 'text/html' && !html) {
            html = decodedData;
          }
        }
      }
      if (part?.parts) {
        findParts(part.parts);
      }
    }
  };
  findParts(partsToVisit);
  return { text, html };
};

// --- Thread Data Processing ---

export interface ProcessedThreadData {
  messages: any[];
  threadId: string;
  subject: string;
  snippet: string;
  lastMessageDate: Date;
}

/**
 * Processes raw thread data from Gmail API
 * Extracts messages, headers, and body content
 */
export function processThreadData(threadJson: any): ProcessedThreadData {
  const messages = threadJson.messages || [];
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];
  
  const subject = firstMessage?.payload?.headers?.find(
    (h: any) => h.name.toLowerCase() === 'subject'
  )?.value || 'No Subject';
  
  const snippet = threadJson.snippet || '';
  const lastMessageDate = new Date(Number(lastMessage?.internalDate || Date.now()));
  
  return {
    messages,
    threadId: threadJson.id,
    subject,
    snippet,
    lastMessageDate
  };
}

/**
 * Extracts body text and HTML from a message payload
 */
export function extractMessageBodies(payload: any): { text?: string, html?: string } {
  return collectBodies(payload);
}

// --- Body Text Cleaning ---

/**
 * Cleans body text by removing signatures, quoted replies, and excessive whitespace
 */
export function cleanBodyText(text: string | undefined): string {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove email signatures (-- patterns)
  cleaned = cleaned.replace(/(?:^|\n)--\s*\n[\s\S]*$/m, '');
  
  // Remove quoted replies ("On ... wrote:")
  cleaned = cleaned.replace(/(?:^|\n)On .* wrote:[\s\S]*$/m, '');
  
  // Remove excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Trim
  cleaned = cleaned.trim();
  
  return cleaned;
}

// --- LLM Formatting ---

/**
 * Formats thread messages for LLM processing
 * Extracted from sync-threads function
 */
export function formatThreadForLLM(messages: any[], csmEmail: string): string {
  let script = "";
  for (const msg of messages) {
    const headers = msg.payload?.headers || [];
    const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
    const fromEmail = fromHeader.match(/<([^>]+)>/)?.[1] || fromHeader;
    const sentDate = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || 
                     new Date(Number(msg.internalDate)).toISOString();

    const role = fromEmail.includes(csmEmail) ? "CSM" : "Customer";
    const bodies = collectBodies(msg.payload);
    
    script += `---
Role: ${role}
From: ${fromHeader}
Date: ${sentDate}

${bodies.text || '[No plain text body]'}
---
`;
  }
  return script;
}

/**
 * Estimates token count for text (simple approximation)
 */
export function estimateTokens(text: string): number {
  return text.split(/\s+/).length * 1.5;
}

// --- Chunking ---

export interface ChunkData {
  chunks: string[];
  chunk_count: number;
  total_tokens: number;
  requires_map_reduce: boolean;
}

/**
 * Chunks a thread script into smaller pieces for OpenAI processing
 * Uses message-based chunking (15 messages per chunk) for safety
 */
export function chunkThread(script: string, chunkSize: number = 15): ChunkData {
  const scriptChunks = script.split('\n---\n').filter(s => s.trim().length > 0);
  const tokenCount = estimateTokens(script);
  const TOKEN_LIMIT = 100000; // gemini-3-flash-preview context window (using 100k as safe limit)
  
  let chunks: string[] = [];
  
  if (tokenCount < (TOKEN_LIMIT - 2000)) {
    // Thread fits in one chunk
    chunks = [script];
  } else {
    // Need to chunk - use message-based chunking
    for (let i = 0; i < scriptChunks.length; i += chunkSize) {
      chunks.push(scriptChunks.slice(i, i + chunkSize).join('\n---\n'));
    }
  }
  
  return {
    chunks,
    chunk_count: chunks.length,
    total_tokens: tokenCount,
    requires_map_reduce: chunks.length > 1
  };
}

// --- Error Handling ---

export interface StageErrorResult {
  shouldRetry: boolean;
  nextRetryAt: Date | null;
  errorMessage: string;
}

/**
 * Handles stage errors with retry logic
 * Returns whether to retry and when to retry next
 * Special handling for connection pool errors with longer backoff
 */
export function handleStageError(
  error: Error | unknown,
  currentAttempts: number,
  maxAttempts: number = 3
): StageErrorResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isConnectionPoolError = errorMessage.includes('connection pool') || 
                                 errorMessage.includes('PGRST003') ||
                                 errorMessage.includes('Timed out acquiring connection');
  
  const shouldRetry = currentAttempts < maxAttempts;
  
  let nextRetryAt: Date | null = null;
  if (shouldRetry) {
    // For connection pool errors, use longer backoff (5s, 10s, 20s)
    // For other errors, use standard exponential backoff (2s, 4s, 8s)
    const baseDelay = isConnectionPoolError ? 5000 : 2000;
    const delayMs = baseDelay * Math.pow(2, currentAttempts);
    // Cap at 30 seconds for connection pool errors, 10 seconds for others
    const maxDelay = isConnectionPoolError ? 30000 : 10000;
    nextRetryAt = new Date(Date.now() + Math.min(delayMs, maxDelay));
  }
  
  return {
    shouldRetry,
    nextRetryAt,
    errorMessage
  };
}

