// Shared utility functions for meeting URL detection and extraction

export type GoogleCalendarEvent = {
  id: string
  summary?: string
  description?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  hangoutLink?: string | null
  location?: string
  attendees?: Array<{
    email: string
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted'
  }>
}

export type MeetingUrlResult = {
  url: string | null
  type: 'google_meet' | 'zoom' | null
}

/**
 * Detects the meeting type from a URL
 * @param url The meeting URL to analyze
 * @returns 'google_meet', 'zoom', or null if unknown
 */
export function detectMeetingType(url: string | null | undefined): 'google_meet' | 'zoom' | null {
  if (!url) return null

  const lowerUrl = url.toLowerCase().trim()

  // Google Meet detection: URLs containing meet.google.com
  if (lowerUrl.includes('meet.google.com')) {
    return 'google_meet'
  }

  // Zoom detection: URLs containing zoom.us/j/ or various zoom subdomain patterns
  // Patterns: zoom.us/j/, us02web.zoom.us/j/, company.zoom.us/j/, etc.
  const zoomPattern = /zoom\.us\/j\//i
  if (zoomPattern.test(lowerUrl)) {
    return 'zoom'
  }

  // Also check for zoom.us/join/ pattern
  if (lowerUrl.includes('zoom.us/join/')) {
    return 'zoom'
  }

  return null
}

/**
 * Extracts Zoom meeting link from location or description fields
 * @param location The location field from Google Calendar event
 * @param description The description field from Google Calendar event
 * @returns First Zoom URL found, or null
 */
export function extractZoomLink(location: string | null | undefined, description: string | null | undefined): string | null {
  // Zoom URL patterns to search for
  const zoomUrlPattern = /https?:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/(?:j|join)\/(?:[a-zA-Z0-9?=_-]+)/gi

  // Check location field first
  if (location) {
    const locationMatch = location.match(zoomUrlPattern)
    if (locationMatch && locationMatch.length > 0) {
      return locationMatch[0]
    }
  }

  // Check description field
  if (description) {
    const descriptionMatch = description.match(zoomUrlPattern)
    if (descriptionMatch && descriptionMatch.length > 0) {
      return descriptionMatch[0]
    }
  }

  return null
}

/**
 * Gets the meeting URL and type from a Google Calendar event
 * Priority order:
 * 1. Check hangoutLink (Google Meet)
 * 2. Check location for Zoom link
 * 3. Check description for Zoom link
 * @param event The Google Calendar event
 * @returns Object with url and type, or both null if not found
 */
export function getMeetingUrl(event: GoogleCalendarEvent): MeetingUrlResult {
  // Priority 1: Check hangoutLink (Google Meet)
  if (event.hangoutLink) {
    const type = detectMeetingType(event.hangoutLink)
    if (type === 'google_meet') {
      return {
        url: event.hangoutLink,
        type: 'google_meet'
      }
    }
    // If hangoutLink exists but isn't Google Meet, still use it (edge case)
    if (type) {
      return {
        url: event.hangoutLink,
        type: type
      }
    }
  }

  // Priority 2: Check location for Zoom link
  const zoomFromLocation = extractZoomLink(event.location, null)
  if (zoomFromLocation) {
    return {
      url: zoomFromLocation,
      type: 'zoom'
    }
  }

  // Priority 3: Check description for Zoom link
  const zoomFromDescription = extractZoomLink(null, event.description)
  if (zoomFromDescription) {
    return {
      url: zoomFromDescription,
      type: 'zoom'
    }
  }

  // No meeting URL found
  return {
    url: null,
    type: null
  }
}

