import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, Form, Link } from "@remix-run/react";
import { useState } from "react";
import { eq } from "drizzle-orm";
import { addMonths, format } from "date-fns";
import { getDb } from "~/lib/db.server";
import { eventSeries, events } from "~/lib/schema";
import { RecurrenceForm } from "~/components/RecurrenceForm";
import {
  type RecurrenceRule,
  generateOccurrences,
  parseRecurrenceRule,
} from "~/lib/recurrence";

type ActionData = {
  success: false;
  errors: Record<string, string>;
} | null;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context?.cloudflare?.env?.DB);
  const formData = await request.formData();

  // Event details
  const name = formData.get("name") as string;
  const startDate = formData.get("startDate") as string;
  const timeStart = formData.get("timeStart") as string;
  const timeEnd = formData.get("timeEnd") as string | null;
  const location = formData.get("location") as string;
  const description = formData.get("description") as string;
  const capacityStr = formData.get("capacity") as string;
  const requiresWaiver = formData.get("requiresWaiver") === "on";
  const waiverText = formData.get("waiverText") as string | null;
  const discordLink = formData.get("discordLink") as string | null;

  // Recurrence settings
  const recurrenceRuleStr = formData.get("recurrenceRule") as string;
  const endType = formData.get("endType") as string;
  const endDate = formData.get("endDate") as string | null;
  const maxOccurrencesStr = formData.get("maxOccurrences") as string | null;

  // Validate required fields
  const errors: Record<string, string> = {};

  if (!name?.trim()) errors.name = "Name is required";
  if (!startDate) errors.startDate = "Start date is required";
  if (!timeStart) errors.timeStart = "Start time is required";
  if (!location?.trim()) errors.location = "Location is required";
  if (!description?.trim()) errors.description = "Description is required";
  if (!recurrenceRuleStr) errors.recurrence = "Recurrence pattern is required";

  // Validate recurrence rule
  let recurrenceRule: RecurrenceRule;
  try {
    recurrenceRule = parseRecurrenceRule(recurrenceRuleStr);
    if (
      (recurrenceRule.frequency === "weekly" || recurrenceRule.frequency === "biweekly") &&
      (!recurrenceRule.daysOfWeek || recurrenceRule.daysOfWeek.length === 0)
    ) {
      errors.recurrence = "Select at least one day of the week";
    }
  } catch {
    errors.recurrence = "Invalid recurrence pattern";
  }

  if (Object.keys(errors).length > 0) {
    return json<ActionData>({ success: false, errors }, { status: 400 });
  }

  // Parse optional fields
  const capacity = capacityStr ? parseInt(capacityStr, 10) : null;
  const maxOccurrences = maxOccurrencesStr ? parseInt(maxOccurrencesStr, 10) : null;

  // Create the series
  const seriesId = crypto.randomUUID();
  await db
    .insert(eventSeries)
    .values({
      id: seriesId,
      name: name.trim(),
      description: description.trim(),
      timeStart,
      timeEnd: timeEnd?.trim() || null,
      location: location.trim(),
      capacity,
      requiresWaiver,
      waiverText: waiverText?.trim() || null,
      discordLink: discordLink?.trim() || null,
      recurrenceRule: recurrenceRuleStr,
      startDate,
      endDate: endType === "date" ? endDate : null,
      maxOccurrences: endType === "count" ? maxOccurrences : null,
      status: "active",
    })
    .run();

  // Generate initial occurrences (3 months ahead)
  const generateUntil = format(addMonths(new Date(), 3), "yyyy-MM-dd");
  const occurrences = generateOccurrences({
    rule: recurrenceRule!,
    startDate,
    endDate: endType === "date" ? endDate! : null,
    maxOccurrences: endType === "count" ? maxOccurrences : null,
    generateUntil,
  });

  // Create event instances
  const baseSlug = slugify(name);
  for (const occurrenceDate of occurrences) {
    // Generate unique slug with date
    let slug = `${baseSlug}-${occurrenceDate}`;

    // Check for existing slug and make unique if needed
    const existing = await db
      .select()
      .from(events)
      .where(eq(events.slug, slug))
      .get();

    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    await db
      .insert(events)
      .values({
        name: name.trim(),
        slug,
        description: description.trim(),
        date: occurrenceDate,
        timeStart,
        timeEnd: timeEnd?.trim() || null,
        location: location.trim(),
        capacity,
        requiresWaiver,
        waiverText: waiverText?.trim() || null,
        discordLink: discordLink?.trim() || null,
        status: "published", // Auto-publish series instances
        seriesId,
        seriesInstanceDate: occurrenceDate,
        isSeriesException: false,
      })
      .run();
  }

  return redirect(`/admin/series/${seriesId}`);
}

export default function NewSeries() {
  const actionData = useActionData<ActionData>();
  const [startDate, setStartDate] = useState("");

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/admin/series"
          className="text-sm text-primary hover:text-primary/80"
        >
          &larr; Back to Recurring Events
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Create Recurring Event</h1>
      <p className="mt-1 text-sm text-gray-500">
        Set up an event that repeats on a schedule. Individual instances can be edited or cancelled later.
      </p>

      <Form method="post" className="mt-6 max-w-2xl space-y-6">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Event Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Open Hack Night"
          />
          {actionData?.errors?.name && (
            <p className="mt-1 text-sm text-red-600">{actionData.errors.name}</p>
          )}
        </div>

        {/* Start Date and Time */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
              First Occurrence *
            </label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {actionData?.errors?.startDate && (
              <p className="mt-1 text-sm text-red-600">{actionData.errors.startDate}</p>
            )}
          </div>
          <div>
            <label htmlFor="timeStart" className="block text-sm font-medium text-gray-700">
              Start Time *
            </label>
            <input
              type="time"
              id="timeStart"
              name="timeStart"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {actionData?.errors?.timeStart && (
              <p className="mt-1 text-sm text-red-600">{actionData.errors.timeStart}</p>
            )}
          </div>
          <div>
            <label htmlFor="timeEnd" className="block text-sm font-medium text-gray-700">
              End Time
            </label>
            <input
              type="time"
              id="timeEnd"
              name="timeEnd"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Recurrence Pattern */}
        {actionData?.errors?.recurrence && (
          <p className="text-sm text-red-600">{actionData.errors.recurrence}</p>
        )}
        <RecurrenceForm startDate={startDate} />

        {/* Location */}
        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-700">
            Location *
          </label>
          <input
            type="text"
            id="location"
            name="location"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Fubar Labs, 303 3rd Ave, New Brunswick, NJ"
          />
          {actionData?.errors?.location && (
            <p className="mt-1 text-sm text-red-600">{actionData.errors.location}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description *
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Tell attendees what to expect at each event..."
          />
          {actionData?.errors?.description && (
            <p className="mt-1 text-sm text-red-600">{actionData.errors.description}</p>
          )}
        </div>

        {/* Capacity */}
        <div>
          <label htmlFor="capacity" className="block text-sm font-medium text-gray-700">
            Capacity (leave blank for unlimited)
          </label>
          <input
            type="number"
            id="capacity"
            name="capacity"
            min="1"
            className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="50"
          />
        </div>

        {/* Waiver */}
        <div className="space-y-4 rounded-lg border border-gray-200 p-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              name="requiresWaiver"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="ml-2 text-sm font-medium text-gray-700">
              Requires waiver signature
            </span>
          </label>
          <div>
            <label htmlFor="waiverText" className="block text-sm font-medium text-gray-700">
              Additional Waiver Terms (optional)
            </label>
            <textarea
              id="waiverText"
              name="waiverText"
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Event-specific terms beyond the default waiver..."
            />
            <p className="mt-1 text-xs text-gray-500">
              Standard waiver items (liability, safety, etc.) are included automatically.
            </p>
          </div>
        </div>

        {/* Discord */}
        <div>
          <label htmlFor="discordLink" className="block text-sm font-medium text-gray-700">
            Discord Invite Link (optional)
          </label>
          <input
            type="url"
            id="discordLink"
            name="discordLink"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="https://discord.gg/..."
          />
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            className="rounded-md bg-primary px-6 py-2 text-primary-foreground font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Create Recurring Event
          </button>
          <Link
            to="/admin/series"
            className="rounded-md border border-gray-300 px-6 py-2 text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
