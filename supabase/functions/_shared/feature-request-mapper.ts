// Shared utility for mapping feature request formats
// Handles conversion from new format (title, customer_description, use_case, etc.)
// to old format (feature_title, request_details, urgency) for database storage

export interface NewFormatFeatureRequest {
  title?: string;
  feature_title?: string; // For backward compatibility
  customer_description?: string;
  use_case?: string;
  urgency: 'Low' | 'Medium' | 'High';
  urgency_signals?: string;
  customer_impact?: string;
  request_details?: string; // For backward compatibility
}

export interface OldFormatFeatureRequest {
  feature_title: string;
  request_details: string;
  urgency: 'Low' | 'Medium' | 'High';
}

/**
 * Maps feature request from new format to old format
 * Supports both new format (title, customer_description, use_case, etc.)
 * and old format (feature_title, request_details) for backward compatibility
 * 
 * @param req - Feature request in either new or old format
 * @returns Feature request in old format, or null if invalid
 */
export function mapFeatureRequest(req: any): OldFormatFeatureRequest | null {
  if (!req || typeof req !== 'object') {
    return null;
  }

  // Extract feature_title (support both formats)
  const featureTitle = req.title || req.feature_title;
  if (!featureTitle || typeof featureTitle !== 'string' || featureTitle.trim() === '') {
    return null;
  }

  // Validate urgency
  const urgency = req.urgency;
  if (!urgency || !['Low', 'Medium', 'High'].includes(urgency)) {
    return null;
  }

  // Build request_details
  let requestDetails = '';

  // If old format has request_details, use it (backward compatibility)
  if (req.request_details && typeof req.request_details === 'string' && req.request_details.trim() !== '') {
    requestDetails = req.request_details.trim();
  } else {
    // New format: combine customer_description, use_case, urgency_signals, customer_impact
    const parts: string[] = [];

    // Customer description (primary content)
    if (req.customer_description && typeof req.customer_description === 'string') {
      const desc = req.customer_description.trim();
      if (desc) parts.push(desc);
    }

    // Use case
    if (req.use_case && typeof req.use_case === 'string') {
      const useCase = req.use_case.trim();
      if (useCase) parts.push(`Use case: ${useCase}`);
    }

    // Urgency signals
    if (req.urgency_signals && typeof req.urgency_signals === 'string') {
      const signals = req.urgency_signals.trim();
      if (signals) parts.push(`Urgency signals: ${signals}`);
    }

    // Customer impact
    if (req.customer_impact && typeof req.customer_impact === 'string') {
      const impact = req.customer_impact.trim();
      if (impact) parts.push(`Impact: ${impact}`);
    }

    // Combine all parts
    if (parts.length > 0) {
      requestDetails = parts.join('. ').trim();
    } else if (req.customer_description && typeof req.customer_description === 'string') {
      // Fallback to just customer_description if other fields missing
      requestDetails = req.customer_description.trim();
    } else {
      // Last resort fallback
      requestDetails = 'No details provided';
    }
  }

  // Ensure request_details is not empty
  if (requestDetails.trim() === '') {
    requestDetails = 'No details provided';
  }

  return {
    feature_title: featureTitle.trim(),
    request_details: requestDetails,
    urgency: urgency as 'Low' | 'Medium' | 'High'
  };
}

/**
 * Maps an array of feature requests from new format to old format
 * Filters out invalid entries and logs warnings
 * 
 * @param requests - Array of feature requests in either format
 * @returns Array of valid feature requests in old format
 */
export function mapFeatureRequests(requests: any[]): OldFormatFeatureRequest[] {
  if (!Array.isArray(requests)) {
    return [];
  }

  const mapped: OldFormatFeatureRequest[] = [];
  let invalidCount = 0;

  for (const req of requests) {
    const mappedReq = mapFeatureRequest(req);
    if (mappedReq) {
      mapped.push(mappedReq);
    } else {
      invalidCount++;
      if (invalidCount <= 5) { // Log first 5 invalid entries
        console.warn('Invalid feature request filtered out:', JSON.stringify(req));
      }
    }
  }

  if (invalidCount > 5) {
    console.warn(`... and ${invalidCount - 5} more invalid feature requests filtered out`);
  }

  return mapped;
}
