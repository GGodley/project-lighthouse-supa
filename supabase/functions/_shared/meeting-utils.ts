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
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType?: string
      uri?: string
    }>
  }
}

export type MeetingUrlResult = {
  url: string | null
  type: 'google_meet' | 'zoom' | null
}

export type MeetingStatus = 
  | 'new'                      // New meeting, ready for bot dispatch
  | 'passed_event'             // Meeting time has passed
  | 'scheduling_in_progress'   // Bot is being scheduled (atomic lock state)
  | 'recording_scheduled'      // Bot successfully scheduled
  | 'rescheduling'             // Meeting is being rescheduled (bot deletion in progress)
  | 'missing_url'              // Meeting has no valid meeting URL
  | 'error'                    // Error occurred during processing
  | null

export type ErrorDetails = {
  type: string
  message: string
  context?: Record<string, unknown>
  stack?: string
  timestamp: string
  operation?: string
  oldBotId?: string
  [key: string]: unknown
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
 * Extracts Google Meet link from location or description fields
 * @param location The location field from Google Calendar event
 * @param description The description field from Google Calendar event
 * @returns First Google Meet URL found, or null
 */
export function extractGoogleMeetLink(location: string | null | undefined, description: string | null | undefined): string | null {
  // Google Meet URL pattern: https://meet.google.com/xxx-xxxx-xxx
  const meetUrlPattern = /https?:\/\/meet\.google\.com\/[a-z-]+/gi

  // Check location field first
  if (location) {
    const locationMatch = location.match(meetUrlPattern)
    if (locationMatch && locationMatch.length > 0) {
      return locationMatch[0]
    }
  }

  // Check description field
  if (description) {
    const descriptionMatch = description.match(meetUrlPattern)
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
 * 2. Check conferenceData.entryPoints (Google Calendar API v3)
 * 3. Check location for Google Meet link
 * 4. Check description for Google Meet link
 * 5. Check location for Zoom link
 * 6. Check description for Zoom link
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

  // Priority 2: Check conferenceData.entryPoints (Google Calendar API v3)
  // Some Google Meet links are only in conferenceData
  if (event.conferenceData?.entryPoints) {
    const videoEntry = event.conferenceData.entryPoints.find(
      (ep) => ep.entryPointType === 'video' && ep.uri
    )
    if (videoEntry?.uri) {
      const type = detectMeetingType(videoEntry.uri)
      if (type === 'google_meet') {
        return {
          url: videoEntry.uri,
          type: 'google_meet'
        }
      }
      // If it's a Zoom link in conferenceData, use it
      if (type === 'zoom') {
        return {
          url: videoEntry.uri,
          type: 'zoom'
        }
      }
    }
  }

  // Priority 3: Check location for Google Meet link
  const meetFromLocation = extractGoogleMeetLink(event.location, null)
  if (meetFromLocation) {
    return {
      url: meetFromLocation,
      type: 'google_meet'
    }
  }

  // Priority 4: Check description for Google Meet link
  const meetFromDescription = extractGoogleMeetLink(null, event.description)
  if (meetFromDescription) {
    return {
      url: meetFromDescription,
      type: 'google_meet'
    }
  }

  // Priority 5: Check location for Zoom link
  const zoomFromLocation = extractZoomLink(event.location, null)
  if (zoomFromLocation) {
    return {
      url: zoomFromLocation,
      type: 'zoom'
    }
  }

  // Priority 6: Check description for Zoom link
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

