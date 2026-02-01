// Recurrence pattern types
export type Frequency = "weekly" | "biweekly" | "monthly";

export interface MonthlyPattern {
  type: "dayOfMonth" | "weekdayOfMonth";
  day?: number; // For dayOfMonth (1-31)
  weekday?: number; // For weekdayOfMonth (0=Sunday, 6=Saturday)
  occurrence?: number; // 1st, 2nd, 3rd, 4th, or -1 for "last"
}

export interface RecurrenceRule {
  frequency: Frequency;
  daysOfWeek?: number[]; // 0=Sunday, 6=Saturday (for weekly/biweekly)
  monthlyPattern?: MonthlyPattern;
}

export interface GenerateOccurrencesOptions {
  rule: RecurrenceRule;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  maxOccurrences?: number | null;
  generateUntil?: string; // YYYY-MM-DD - how far ahead to generate
}

// Labels for display
export const frequencyLabels: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

export const dayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const dayLabelsShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const occurrenceLabels: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  "-1": "Last",
};

// ============================================================================
// Pure date string utilities (no Date objects to avoid timezone issues)
// ============================================================================

/**
 * Parse a YYYY-MM-DD string into components
 */
function parseDateString(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month: month - 1, day }; // month is 0-indexed
}

/**
 * Format year, month (0-indexed), day into YYYY-MM-DD string
 */
function formatDateString(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/**
 * Get the number of days in a month
 */
function getDaysInMonth(year: number, month: number): number {
  // month is 0-indexed; getting day 0 of next month gives last day of current month
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Get the day of week (0=Sunday, 6=Saturday) for a date
 */
function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

/**
 * Compare two date strings. Returns -1 if a < b, 0 if equal, 1 if a > b
 */
function compareDateStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Add days to a date string
 */
function addDaysToDateString(dateStr: string, days: number): string {
  const { year, month, day } = parseDateString(dateStr);
  const date = new Date(Date.UTC(year, month, day + days));
  return formatDateString(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Add weeks to a date string
 */
function addWeeksToDateString(dateStr: string, weeks: number): string {
  return addDaysToDateString(dateStr, weeks * 7);
}

/**
 * Add months to a date string (keeps same day, or last day of month if needed)
 */
function addMonthsToDateString(dateStr: string, months: number): string {
  const { year, month, day } = parseDateString(dateStr);
  const newMonth = month + months;
  const newYear = year + Math.floor(newMonth / 12);
  const normalizedMonth = ((newMonth % 12) + 12) % 12;
  const daysInNewMonth = getDaysInMonth(newYear, normalizedMonth);
  const newDay = Math.min(day, daysInNewMonth);
  return formatDateString(newYear, normalizedMonth, newDay);
}

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayString(): string {
  const now = new Date();
  return formatDateString(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Get a date N months from now as YYYY-MM-DD string
 */
function getDateMonthsFromNow(months: number): string {
  return addMonthsToDateString(getTodayString(), months);
}

// ============================================================================
// Recurrence calculation functions
// ============================================================================

/**
 * Get the Nth occurrence of a weekday in a month
 * @param year - The year
 * @param month - The month (0-indexed)
 * @param weekday - The day of the week (0=Sunday, 6=Saturday)
 * @param occurrence - Which occurrence (1-4, or -1 for last)
 * @returns The date string (YYYY-MM-DD), or null if it doesn't exist
 */
export function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  occurrence: number
): string | null {
  const daysInMonth = getDaysInMonth(year, month);

  if (occurrence === -1) {
    // Find the last occurrence
    for (let day = daysInMonth; day >= 1; day--) {
      if (getDayOfWeek(year, month, day) === weekday) {
        return formatDateString(year, month, day);
      }
    }
    return null;
  }

  // Find the Nth occurrence
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (getDayOfWeek(year, month, day) === weekday) {
      count++;
      if (count === occurrence) {
        return formatDateString(year, month, day);
      }
    }
  }

  return null; // The Nth occurrence doesn't exist in this month
}

/**
 * Generate occurrence dates for a recurring event
 * All operations use pure string manipulation to avoid timezone issues
 */
export function generateOccurrences(
  options: GenerateOccurrencesOptions
): string[] {
  const { rule, startDate, endDate, maxOccurrences, generateUntil } = options;
  const occurrences: string[] = [];

  const untilDate = generateUntil || getDateMonthsFromNow(3);
  let count = 0;

  if (rule.frequency === "weekly" || rule.frequency === "biweekly") {
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      // Weekly/biweekly with specific days
      const { year, month, day } = parseDateString(startDate);
      const startDayOfWeek = getDayOfWeek(year, month, day);

      // Find the start of the week containing startDate
      let weekStartDate = addDaysToDateString(startDate, -startDayOfWeek);
      let weekOffset = 0;

      while (true) {
        const currentWeekStart = addWeeksToDateString(
          weekStartDate,
          weekOffset * (rule.frequency === "biweekly" ? 2 : 1)
        );

        for (const dayOfWeek of rule.daysOfWeek.sort((a, b) => a - b)) {
          const dateStr = addDaysToDateString(currentWeekStart, dayOfWeek);

          // Skip dates before start
          if (compareDateStrings(dateStr, startDate) < 0) continue;

          // Check end conditions
          if (endDate && compareDateStrings(dateStr, endDate) > 0) {
            return occurrences;
          }
          if (maxOccurrences && count >= maxOccurrences) {
            return occurrences;
          }
          if (compareDateStrings(dateStr, untilDate) > 0) {
            return occurrences;
          }

          occurrences.push(dateStr);
          count++;
        }

        weekOffset++;
        if (weekOffset > 520) break; // Safety limit: 10 years
      }
    } else {
      // Simple weekly/biweekly - use same day of week as start
      let currentDate = startDate;

      while (true) {
        if (endDate && compareDateStrings(currentDate, endDate) > 0) {
          return occurrences;
        }
        if (maxOccurrences && count >= maxOccurrences) {
          return occurrences;
        }
        if (compareDateStrings(currentDate, untilDate) > 0) {
          return occurrences;
        }

        occurrences.push(currentDate);
        count++;

        currentDate = addWeeksToDateString(
          currentDate,
          rule.frequency === "biweekly" ? 2 : 1
        );

        if (count > 520) break; // Safety limit
      }
    }
  } else if (rule.frequency === "monthly") {
    const pattern = rule.monthlyPattern;
    let { year, month } = parseDateString(startDate);

    while (true) {
      let dateStr: string | null = null;

      if (pattern?.type === "dayOfMonth" && pattern.day) {
        // Simple day of month (e.g., 15th of every month)
        const daysInMonth = getDaysInMonth(year, month);
        const targetDay = Math.min(pattern.day, daysInMonth);
        dateStr = formatDateString(year, month, targetDay);
      } else if (
        pattern?.type === "weekdayOfMonth" &&
        pattern.weekday !== undefined &&
        pattern.occurrence !== undefined
      ) {
        // Nth weekday of month (e.g., 2nd Tuesday)
        dateStr = getNthWeekdayOfMonth(year, month, pattern.weekday, pattern.occurrence);
      }

      if (dateStr) {
        // Skip dates before start
        if (compareDateStrings(dateStr, startDate) >= 0) {
          // Check end conditions
          if (endDate && compareDateStrings(dateStr, endDate) > 0) {
            return occurrences;
          }
          if (maxOccurrences && count >= maxOccurrences) {
            return occurrences;
          }
          if (compareDateStrings(dateStr, untilDate) > 0) {
            return occurrences;
          }

          occurrences.push(dateStr);
          count++;
        }
      }

      // Move to next month
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }

      // Safety limit: 10 years
      const { year: startYear } = parseDateString(startDate);
      if (year - startYear > 10) break;
    }
  }

  return occurrences;
}

/**
 * Describe a recurrence rule in human-readable format
 */
export function describeRecurrenceRule(rule: RecurrenceRule): string {
  const { frequency, daysOfWeek, monthlyPattern } = rule;

  if (frequency === "weekly" || frequency === "biweekly") {
    const prefix = frequency === "weekly" ? "Every" : "Every other";
    if (daysOfWeek && daysOfWeek.length > 0) {
      const days = daysOfWeek.map((d) => dayLabels[d]).join(", ");
      return `${prefix} ${days}`;
    }
    return `${prefix} week`;
  }

  if (frequency === "monthly" && monthlyPattern) {
    if (monthlyPattern.type === "dayOfMonth" && monthlyPattern.day) {
      return `Monthly on the ${monthlyPattern.day}${getOrdinalSuffix(monthlyPattern.day)}`;
    }
    if (
      monthlyPattern.type === "weekdayOfMonth" &&
      monthlyPattern.weekday !== undefined &&
      monthlyPattern.occurrence !== undefined
    ) {
      const occ = occurrenceLabels[monthlyPattern.occurrence] || "";
      const day = dayLabels[monthlyPattern.weekday];
      return `Monthly on the ${occ} ${day}`;
    }
  }

  return frequencyLabels[frequency];
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Parse a recurrence rule from JSON string
 */
export function parseRecurrenceRule(json: string): RecurrenceRule {
  return JSON.parse(json) as RecurrenceRule;
}

/**
 * Stringify a recurrence rule to JSON
 */
export function stringifyRecurrenceRule(rule: RecurrenceRule): string {
  return JSON.stringify(rule);
}

/**
 * Create a default weekly recurrence rule based on a start date
 */
export function createDefaultWeeklyRule(startDate: string): RecurrenceRule {
  const { year, month, day } = parseDateString(startDate);
  const dayOfWeek = getDayOfWeek(year, month, day);
  return {
    frequency: "weekly",
    daysOfWeek: [dayOfWeek],
  };
}

/**
 * Create a default monthly recurrence rule based on a start date
 * Uses the Nth weekday pattern (e.g., "2nd Tuesday")
 */
export function createDefaultMonthlyRule(startDate: string): RecurrenceRule {
  const { year, month, day } = parseDateString(startDate);
  const dayOfWeek = getDayOfWeek(year, month, day);

  // Calculate which occurrence of the weekday this is
  const occurrence = Math.ceil(day / 7);

  return {
    frequency: "monthly",
    monthlyPattern: {
      type: "weekdayOfMonth",
      weekday: dayOfWeek,
      occurrence,
    },
  };
}
