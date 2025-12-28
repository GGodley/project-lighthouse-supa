// UTC timezone utilities for Recall.ai integration
// All times sent to Recall.ai must be in UTC ISO format

/**
 * Converts any date to UTC ISO string
 * Handles timezone-aware and timezone-naive dates
 * Always returns format: YYYY-MM-DDTHH:mm:ss.sssZ
 */
export function ensureUTCISO(date: Date | string): string {
  let dateObj: Date;
  
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }

  // toISOString() always returns UTC
  return dateObj.toISOString();
}

/**
 * Calculates join time for Recall.ai bot (1 minute before meeting start)
 * @param startTime Meeting start time (Date or ISO string)
 * @returns UTC ISO string for Recall.ai join_at field
 */
export function calculateJoinTime(startTime: string | Date): string {
  let startDate: Date;
  
  if (typeof startTime === 'string') {
    startDate = new Date(startTime);
  } else {
    startDate = startTime;
  }

  // Subtract 1 minute (60000ms)
  const joinTime = new Date(startDate.getTime() - 60000);
  
  // Return UTC ISO string
  return joinTime.toISOString();
}

/**
 * Compares two ISO timestamps to check if time has changed
 * Handles timezone conversions properly
 * @param oldTime Old timestamp (ISO string)
 * @param newTime New timestamp (ISO string)
 * @returns true if times differ
 */
export function isTimeChanged(
  oldTime: string | null | undefined,
  newTime: string | null | undefined
): boolean {
  if (!oldTime || !newTime) {
    return oldTime !== newTime; // Changed if one is null and other isn't
  }

  // Convert both to Date objects and compare
  const oldDate = new Date(oldTime);
  const newDate = new Date(newTime);

  // Compare timestamps (handles timezone conversions automatically)
  return oldDate.getTime() !== newDate.getTime();
}

