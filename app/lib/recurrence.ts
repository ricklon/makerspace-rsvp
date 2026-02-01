import {
  addWeeks,
  addMonths,
  setDate,
  getDay,
  startOfMonth,
  addDays,
  isBefore,
  isAfter,
  parseISO,
  format,
} from "date-fns";

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

/**
 * Get the Nth occurrence of a weekday in a month
 * @param year - The year
 * @param month - The month (0-indexed)
 * @param weekday - The day of the week (0=Sunday, 6=Saturday)
 * @param occurrence - Which occurrence (1-4, or -1 for last)
 * @returns The date, or null if it doesn't exist
 */
export function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  occurrence: number
): Date | null {
  const firstOfMonth = new Date(year, month, 1);

  if (occurrence === -1) {
    // Find the last occurrence
    const nextMonth = new Date(year, month + 1, 0); // Last day of current month
    let day = nextMonth.getDate();
    while (day > 0) {
      const date = new Date(year, month, day);
      if (getDay(date) === weekday) {
        return date;
      }
      day--;
    }
    return null;
  }

  // Find the Nth occurrence
  let count = 0;
  let day = 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  while (day <= daysInMonth) {
    const date = new Date(year, month, day);
    if (getDay(date) === weekday) {
      count++;
      if (count === occurrence) {
        return date;
      }
    }
    day++;
  }

  return null; // The Nth occurrence doesn't exist in this month
}

/**
 * Generate occurrence dates for a recurring event
 */
export function generateOccurrences(
  options: GenerateOccurrencesOptions
): string[] {
  const { rule, startDate, endDate, maxOccurrences, generateUntil } = options;
  const occurrences: string[] = [];

  const start = parseISO(startDate);
  const end = endDate ? parseISO(endDate) : null;
  const until = generateUntil
    ? parseISO(generateUntil)
    : addMonths(new Date(), 3); // Default: generate 3 months ahead

  let current = start;
  let count = 0;

  // For weekly/biweekly with specific days, we need to handle differently
  if (
    (rule.frequency === "weekly" || rule.frequency === "biweekly") &&
    rule.daysOfWeek &&
    rule.daysOfWeek.length > 0
  ) {
    // Start from the beginning of the week containing startDate
    const startDayOfWeek = getDay(start);
    const weekStart = addDays(start, -startDayOfWeek);
    let weekOffset = 0;

    while (true) {
      const currentWeekStart = addWeeks(
        weekStart,
        weekOffset * (rule.frequency === "biweekly" ? 2 : 1)
      );

      for (const dayOfWeek of rule.daysOfWeek.sort((a, b) => a - b)) {
        const date = addDays(currentWeekStart, dayOfWeek);

        // Skip dates before start
        if (isBefore(date, start)) continue;

        // Check end conditions
        if (end && isAfter(date, end)) {
          return occurrences;
        }
        if (maxOccurrences && count >= maxOccurrences) {
          return occurrences;
        }
        if (isAfter(date, until)) {
          return occurrences;
        }

        occurrences.push(format(date, "yyyy-MM-dd"));
        count++;
      }

      weekOffset++;

      // Safety limit
      if (weekOffset > 520) break; // 10 years of weeks
    }
  } else if (rule.frequency === "monthly") {
    const pattern = rule.monthlyPattern;

    while (true) {
      let date: Date | null = null;

      if (pattern?.type === "dayOfMonth" && pattern.day) {
        // Simple day of month (e.g., 15th of every month)
        const targetDay = Math.min(
          pattern.day,
          new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
        );
        date = setDate(startOfMonth(current), targetDay);
      } else if (
        pattern?.type === "weekdayOfMonth" &&
        pattern.weekday !== undefined &&
        pattern.occurrence !== undefined
      ) {
        // Nth weekday of month (e.g., 2nd Tuesday)
        date = getNthWeekdayOfMonth(
          current.getFullYear(),
          current.getMonth(),
          pattern.weekday,
          pattern.occurrence
        );
      }

      if (date) {
        // Skip dates before start
        if (!isBefore(date, start)) {
          // Check end conditions
          if (end && isAfter(date, end)) {
            return occurrences;
          }
          if (maxOccurrences && count >= maxOccurrences) {
            return occurrences;
          }
          if (isAfter(date, until)) {
            return occurrences;
          }

          occurrences.push(format(date, "yyyy-MM-dd"));
          count++;
        }
      }

      current = addMonths(current, 1);

      // Safety limit
      if (current.getFullYear() - start.getFullYear() > 10) break;
    }
  } else {
    // Simple weekly/biweekly without specific days - use start date's day of week
    while (true) {
      // Check end conditions
      if (end && isAfter(current, end)) {
        return occurrences;
      }
      if (maxOccurrences && count >= maxOccurrences) {
        return occurrences;
      }
      if (isAfter(current, until)) {
        return occurrences;
      }

      occurrences.push(format(current, "yyyy-MM-dd"));
      count++;

      current = addWeeks(current, rule.frequency === "biweekly" ? 2 : 1);

      // Safety limit
      if (count > 520) break;
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
  const date = parseISO(startDate);
  const dayOfWeek = getDay(date);
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
  const date = parseISO(startDate);
  const dayOfWeek = getDay(date);
  const dayOfMonth = date.getDate();

  // Calculate which occurrence of the weekday this is
  const occurrence = Math.ceil(dayOfMonth / 7);

  return {
    frequency: "monthly",
    monthlyPattern: {
      type: "weekdayOfMonth",
      weekday: dayOfWeek,
      occurrence,
    },
  };
}
