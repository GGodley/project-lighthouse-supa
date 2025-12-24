// Validation utilities for meeting events and data

import type { GoogleCalendarEvent } from './meeting-utils.ts'

export type ValidationResult = {
  valid: boolean
  errors: string[]
}

/**
 * Validates if a string is a valid UUID format
 */
export function isValidUUID(str: string | null | undefined): boolean {
  if (!str) return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

/**
 * Validates if a bot ID is in valid format
 */
export function isValidBotId(botId: string | null | undefined): boolean {
  return isValidUUID(botId)
}

/**
 * Validates a Google Calendar event for required fields and data integrity
 */
export function validateMeetingEvent(event: GoogleCalendarEvent): ValidationResult {
  const errors: string[] = []

  // Check required fields
  if (!event.id) {
    errors.push('Event ID is required')
  }

  if (!event.start && !event.end) {
    errors.push('Event must have at least start or end time')
  }

  // Validate date formats if present
  if (event.start?.dateTime) {
    const startDate = new Date(event.start.dateTime)
    if (isNaN(startDate.getTime())) {
      errors.push(`Invalid start dateTime format: ${event.start.dateTime}`)
    }
  }

  if (event.start?.date) {
    const startDate = new Date(event.start.date)
    if (isNaN(startDate.getTime())) {
      errors.push(`Invalid start date format: ${event.start.date}`)
    }
  }

  if (event.end?.dateTime) {
    const endDate = new Date(event.end.dateTime)
    if (isNaN(endDate.getTime())) {
      errors.push(`Invalid end dateTime format: ${event.end.dateTime}`)
    }
  }

  if (event.end?.date) {
    const endDate = new Date(event.end.date)
    if (isNaN(endDate.getTime())) {
      errors.push(`Invalid end date format: ${event.end.date}`)
    }
  }

  // Validate that end is after start if both are present
  if (event.start && event.end) {
    const startIso = event.start.dateTime || event.start.date
    const endIso = event.end.dateTime || event.end.date

    if (startIso && endIso) {
      const startDate = new Date(startIso)
      const endDate = new Date(endIso)

      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
        if (endDate.getTime() <= startDate.getTime()) {
          errors.push('End time must be after start time')
        }
      }
    }
  }

  // Validate attendees if present
  if (event.attendees) {
    for (let i = 0; i < event.attendees.length; i++) {
      const attendee = event.attendees[i]
      if (!attendee.email) {
        errors.push(`Attendee at index ${i} is missing email`)
      } else if (!attendee.email.includes('@')) {
        errors.push(`Attendee at index ${i} has invalid email format: ${attendee.email}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validates timezone information in event dates
 * Returns true if timezone is present or if date-only format is used
 */
export function hasValidTimezone(event: GoogleCalendarEvent): boolean {
  // If using date-only format (all-day events), timezone is not required
  if (event.start?.date && !event.start.dateTime) {
    return true
  }

  // If using dateTime, timezone should be present
  if (event.start?.dateTime) {
    // Check if dateTime includes timezone info (Z or +/- offset)
    const hasTimezone = event.start.dateTime.includes('Z') || 
                       /[+-]\d{2}:\d{2}$/.test(event.start.dateTime) ||
                       event.start.timeZone !== undefined
    return hasTimezone
  }

  return true
}



