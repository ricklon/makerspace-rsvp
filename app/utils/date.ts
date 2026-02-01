// Default timezone - can be overridden by passing timezone parameter
// Set TIMEZONE env var to your local timezone (e.g., "America/New_York")
const DEFAULT_TIMEZONE = "America/New_York";

export function formatDate(dateString: string, timezone?: string): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  const date = new Date(dateString + "T12:00:00"); // Use noon to avoid date shift issues
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });
}

export function formatTime(timeString: string, timezone?: string): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  const [hours, minutes] = timeString.split(":");
  // Create a date string that won't shift due to timezone
  const date = new Date(`2000-01-01T${timeString}:00`);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

export function formatTimeRange(start: string, end?: string | null, timezone?: string): string {
  const startFormatted = formatTime(start, timezone);
  if (!end) return startFormatted;
  return `${startFormatted} - ${formatTime(end, timezone)}`;
}

export function isEventInPast(dateString: string): boolean {
  const eventDate = new Date(dateString + "T23:59:59");
  return eventDate < new Date();
}

export function isEventToday(dateString: string): boolean {
  const today = new Date();
  const eventDate = new Date(dateString + "T00:00:00");
  return (
    today.getFullYear() === eventDate.getFullYear() &&
    today.getMonth() === eventDate.getMonth() &&
    today.getDate() === eventDate.getDate()
  );
}
