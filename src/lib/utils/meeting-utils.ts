/**
 * Format meeting date and time for display
 * Converts UTC timestamps to local browser timezone
 * 
 * @param startTime - UTC timestamp string (ISO format)
 * @param durationMinutes - Duration in minutes (from backend)
 * @returns Formatted date, time, and duration strings
 */
export function formatMeetingDateTime(
  startTime: string | null,
  durationMinutes: number
): {
  date: string; // "Mon, Dec 12"
  time: string; // "9:30 AM"
  duration: string; // "30 Min"
} {
  if (!startTime) {
    return {
      date: 'Date TBD',
      time: 'Time TBD',
      duration: `${durationMinutes} Min`,
    };
  }

  const date = new Date(startTime);

  // Format date as "Mon, Dec 12"
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Format time as "9:30 AM"
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Format duration
  const formattedDuration = `${durationMinutes} Min`;

  return {
    date: formattedDate,
    time: formattedTime,
    duration: formattedDuration,
  };
}

