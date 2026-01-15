export function formatDate(dateString: string): string {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatTime(timeString: string): string {
  const [hours, minutes] = timeString.split(":");
  const date = new Date();
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatTimeRange(start: string, end?: string | null): string {
  const startFormatted = formatTime(start);
  if (!end) return startFormatted;
  return `${startFormatted} - ${formatTime(end)}`;
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
