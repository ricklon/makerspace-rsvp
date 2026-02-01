// Default timezone - can be overridden by passing timezone parameter
// Set TIMEZONE env var to your local timezone (e.g., "America/New_York")
const DEFAULT_TIMEZONE = "America/New_York";

// Short timezone labels for display
const TIMEZONE_LABELS: Record<string, string> = {
  "America/New_York": "ET",
  "America/Chicago": "CT",
  "America/Denver": "MT",
  "America/Los_Angeles": "PT",
  "America/Sao_Paulo": "BRT",
  "Europe/London": "GMT",
  "Europe/Paris": "CET",
  "Asia/Tokyo": "JST",
  "Australia/Sydney": "AEST",
};

/**
 * Format a date string (YYYY-MM-DD) for display
 * Uses UTC to avoid timezone shift issues
 */
export function formatDate(dateString: string, timezone?: string): string {
  // Parse the date string directly to avoid timezone issues
  const [year, month, day] = dateString.split("-").map(Number);
  // Create date at noon UTC to avoid any date boundary issues
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC", // Always use UTC since our date string is the canonical date
  });
}

/**
 * Format a date string with short format (e.g., "Sun, Feb 1, 2026")
 */
export function formatDateShort(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Get the short timezone label (e.g., "ET" for America/New_York)
 */
export function getTimezoneLabel(timezone?: string): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  return TIMEZONE_LABELS[tz] || tz.split("/").pop() || tz;
}

export function formatTime(timeString: string, timezone?: string): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  // Parse hours and minutes directly to avoid timezone issues
  const [hours, minutes] = timeString.split(":").map(Number);
  const isPM = hours >= 12;
  const hour12 = hours % 12 || 12;
  const ampm = isPM ? "PM" : "AM";
  const mins = String(minutes).padStart(2, "0");
  return `${hour12}:${mins} ${ampm}`;
}

export function formatTimeRange(start: string, end?: string | null, timezone?: string): string {
  const startFormatted = formatTime(start, timezone);
  if (!end) return startFormatted;
  return `${startFormatted} - ${formatTime(end, timezone)}`;
}

/**
 * Format time range with timezone indicator (e.g., "7:00 PM - 9:00 PM ET")
 * Use this for public-facing displays where international attendees need timezone context
 */
export function formatTimeRangeWithTimezone(start: string, end?: string | null, timezone?: string): string {
  const timeRange = formatTimeRange(start, end, timezone);
  const tzLabel = getTimezoneLabel(timezone);
  return `${timeRange} ${tzLabel}`;
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
