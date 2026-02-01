import { useState, useEffect } from "react";
import {
  type Frequency,
  type RecurrenceRule,
  type MonthlyPattern,
  frequencyLabels,
  dayLabelsShort,
  occurrenceLabels,
  describeRecurrenceRule,
} from "~/lib/recurrence";

interface RecurrenceFormProps {
  defaultRule?: RecurrenceRule;
  defaultEndType?: "never" | "date" | "count";
  defaultEndDate?: string;
  defaultMaxOccurrences?: number;
  startDate?: string;
  onChange?: (rule: RecurrenceRule, endType: string, endDate?: string, maxOccurrences?: number) => void;
}

export function RecurrenceForm({
  defaultRule,
  defaultEndType = "never",
  defaultEndDate,
  defaultMaxOccurrences,
  startDate,
  onChange,
}: RecurrenceFormProps) {
  const [frequency, setFrequency] = useState<Frequency>(
    defaultRule?.frequency || "weekly"
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    defaultRule?.daysOfWeek || []
  );
  const [monthlyType, setMonthlyType] = useState<"dayOfMonth" | "weekdayOfMonth">(
    defaultRule?.monthlyPattern?.type || "weekdayOfMonth"
  );
  const [dayOfMonth, setDayOfMonth] = useState<number>(
    defaultRule?.monthlyPattern?.day || 1
  );
  const [weekday, setWeekday] = useState<number>(
    defaultRule?.monthlyPattern?.weekday ?? 0
  );
  const [occurrence, setOccurrence] = useState<number>(
    defaultRule?.monthlyPattern?.occurrence ?? 1
  );
  const [endType, setEndType] = useState<"never" | "date" | "count">(defaultEndType);
  const [endDate, setEndDate] = useState(defaultEndDate || "");
  const [maxOccurrences, setMaxOccurrences] = useState(defaultMaxOccurrences || 10);

  // Set initial days from start date if no default
  useEffect(() => {
    if (!defaultRule && startDate) {
      const date = new Date(startDate + "T00:00:00");
      const dayOfWeek = date.getDay();
      setDaysOfWeek([dayOfWeek]);
      setWeekday(dayOfWeek);

      // Calculate occurrence for monthly
      const dom = date.getDate();
      setDayOfMonth(dom);
      setOccurrence(Math.ceil(dom / 7));
    }
  }, [startDate, defaultRule]);

  // Build the current rule
  const currentRule: RecurrenceRule = (() => {
    if (frequency === "monthly") {
      const monthlyPattern: MonthlyPattern =
        monthlyType === "dayOfMonth"
          ? { type: "dayOfMonth", day: dayOfMonth }
          : { type: "weekdayOfMonth", weekday, occurrence };
      return { frequency, monthlyPattern };
    }
    return { frequency, daysOfWeek };
  })();

  // Notify parent of changes
  useEffect(() => {
    if (onChange) {
      onChange(
        currentRule,
        endType,
        endType === "date" ? endDate : undefined,
        endType === "count" ? maxOccurrences : undefined
      );
    }
  }, [frequency, daysOfWeek, monthlyType, dayOfMonth, weekday, occurrence, endType, endDate, maxOccurrences]);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="text-sm font-medium text-gray-700">Recurrence Pattern</div>

      {/* Frequency */}
      <div>
        <label htmlFor="frequency" className="block text-sm font-medium text-gray-700">
          Repeats
        </label>
        <select
          id="frequency"
          name="frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:w-48"
        >
          {(Object.keys(frequencyLabels) as Frequency[]).map((f) => (
            <option key={f} value={f}>
              {frequencyLabels[f]}
            </option>
          ))}
        </select>
      </div>

      {/* Days of week for weekly/biweekly */}
      {(frequency === "weekly" || frequency === "biweekly") && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            On days
          </label>
          <div className="flex flex-wrap gap-2">
            {dayLabelsShort.map((label, index) => (
              <button
                key={index}
                type="button"
                onClick={() => toggleDay(index)}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  daysOfWeek.includes(index)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {daysOfWeek.length === 0 && (
            <p className="mt-1 text-sm text-amber-600">
              Select at least one day
            </p>
          )}
        </div>
      )}

      {/* Monthly pattern options */}
      {frequency === "monthly" && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Monthly on
          </label>

          {/* Day of month option */}
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="monthlyType"
              value="dayOfMonth"
              checked={monthlyType === "dayOfMonth"}
              onChange={() => setMonthlyType("dayOfMonth")}
              className="h-4 w-4 text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-700">Day</span>
            <select
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
              disabled={monthlyType !== "dayOfMonth"}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-700">of the month</span>
          </label>

          {/* Nth weekday option */}
          <label className="flex items-center gap-2 flex-wrap">
            <input
              type="radio"
              name="monthlyType"
              value="weekdayOfMonth"
              checked={monthlyType === "weekdayOfMonth"}
              onChange={() => setMonthlyType("weekdayOfMonth")}
              className="h-4 w-4 text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-700">The</span>
            <select
              value={occurrence}
              onChange={(e) => setOccurrence(parseInt(e.target.value))}
              disabled={monthlyType !== "weekdayOfMonth"}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
            >
              {Object.entries(occurrenceLabels).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={weekday}
              onChange={(e) => setWeekday(parseInt(e.target.value))}
              disabled={monthlyType !== "weekdayOfMonth"}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
            >
              {dayLabelsShort.map((label, index) => (
                <option key={index} value={index}>
                  {label}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-700">of the month</span>
          </label>
        </div>
      )}

      {/* End condition */}
      <div className="space-y-3 pt-2 border-t border-gray-200">
        <label className="block text-sm font-medium text-gray-700">Ends</label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="endType"
            value="never"
            checked={endType === "never"}
            onChange={() => setEndType("never")}
            className="h-4 w-4 text-primary focus:ring-primary"
          />
          <span className="text-sm text-gray-700">Never (generates instances 3 months ahead)</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="endType"
            value="date"
            checked={endType === "date"}
            onChange={() => setEndType("date")}
            className="h-4 w-4 text-primary focus:ring-primary"
          />
          <span className="text-sm text-gray-700">On date</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={endType !== "date"}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="endType"
            value="count"
            checked={endType === "count"}
            onChange={() => setEndType("count")}
            className="h-4 w-4 text-primary focus:ring-primary"
          />
          <span className="text-sm text-gray-700">After</span>
          <input
            type="number"
            min="1"
            max="100"
            value={maxOccurrences}
            onChange={(e) => setMaxOccurrences(parseInt(e.target.value) || 1)}
            disabled={endType !== "count"}
            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
          />
          <span className="text-sm text-gray-700">occurrences</span>
        </label>
      </div>

      {/* Hidden fields for form submission */}
      <input type="hidden" name="recurrenceRule" value={JSON.stringify(currentRule)} />
      <input type="hidden" name="endType" value={endType} />
      {endType === "date" && <input type="hidden" name="endDate" value={endDate} />}
      {endType === "count" && <input type="hidden" name="maxOccurrences" value={maxOccurrences} />}

      {/* Preview */}
      <div className="pt-2 border-t border-gray-200">
        <div className="text-sm text-gray-600">
          <span className="font-medium">Preview:</span>{" "}
          {describeRecurrenceRule(currentRule)}
          {endType === "date" && endDate && ` until ${endDate}`}
          {endType === "count" && ` for ${maxOccurrences} occurrences`}
        </div>
      </div>
    </div>
  );
}
