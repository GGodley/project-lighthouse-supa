import 'server-only';

/**
 * Derives a 32-byte encryption key from the SUPABASE_SERVICE_ROLE_KEY using SHA-256.
 * This provides a deterministic, secure key for AES-GCM encryption.
 */
async function deriveKey(): Promise<CryptoKey> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
  }

  // Hash the secret with SHA-256 to get a 32-byte key
  const encoder = new TextEncoder();
  const secretBytes = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', secretBytes);

  // Import the hashed key as a CryptoKey for AES-GCM
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Converts an ArrayBuffer to a hex string.
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a hex string to an ArrayBuffer.
 */
function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Encrypts a token using AES-GCM encryption.
 * 
 * @param text - The text to encrypt
 * @returns A hex-encoded string in the format "iv:encryptedText"
 * @throws Error if SUPABASE_SERVICE_ROLE_KEY is not set or encryption fails
 */
export async function encryptToken(text: string): Promise<string> {
  try {
    const key = await deriveKey();
    
    // Generate a random 12-byte IV for GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt the text
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      data
    );
    
    // Convert IV and encrypted data to hex strings
    const ivHex = arrayBufferToHex(iv.buffer);
    const encryptedHex = arrayBufferToHex(encrypted);
    
    // Return in format "iv:encryptedText"
    return `${ivHex}:${encryptedHex}`;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
    throw new Error('Encryption failed: Unknown error');
  }
}

/**
 * Decrypts a token that was encrypted using AES-GCM encryption.
 * 
 * @param text - The encrypted text in format "iv:encryptedText" (hex-encoded)
 * @returns The decrypted string
 * @throws Error if SUPABASE_SERVICE_ROLE_KEY is not set, input format is invalid, or decryption fails
 */
export async function decryptToken(text: string): Promise<string> {
  try {
    // Parse the input to extract IV and encrypted data
    const parts = text.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format: expected "iv:encryptedText"');
    }
    
    const [ivHex, encryptedHex] = parts;
    
    // Convert hex strings back to ArrayBuffers
    const iv = hexToArrayBuffer(ivHex);
    const encrypted = hexToArrayBuffer(encryptedHex);
    
    // Validate IV length (should be 12 bytes = 24 hex characters)
    if (iv.byteLength !== 12) {
      throw new Error('Invalid IV length: expected 12 bytes');
    }
    
    const key = await deriveKey();
    
    // Decrypt the data
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
      },
      key,
      encrypted
    );
    
    // Convert decrypted data back to string
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
    throw new Error('Decryption failed: Unknown error');
  }
}

