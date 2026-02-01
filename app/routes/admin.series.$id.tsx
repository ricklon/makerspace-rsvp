import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useActionData, Form, Link } from "@remix-run/react";
import { useState } from "react";
import { eq, and, gte, desc, asc } from "drizzle-orm";
import { addMonths, format } from "date-fns";
import { getDb } from "~/lib/db.server";
import { eventSeries, events, rsvps } from "~/lib/schema";
import { RecurrenceForm } from "~/components/RecurrenceForm";
import {
  type RecurrenceRule,
  parseRecurrenceRule,
  describeRecurrenceRule,
  generateOccurrences,
} from "~/lib/recurrence";
import { formatTimeRange, formatDateShort } from "~/utils/date";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = getDb(context?.cloudflare?.env.DB);
  const seriesId = params.id;

  if (!seriesId) {
    throw new Response("Series ID required", { status: 400 });
  }

  const series = await db
    .select()
    .from(eventSeries)
    .where(eq(eventSeries.id, seriesId))
    .get();

  if (!series) {
    throw new Response("Series not found", { status: 404 });
  }

  // Get all instances with RSVP counts
  const today = new Date().toISOString().split("T")[0];
  const instances = await db
    .select()
    .from(events)
    .where(eq(events.seriesId, seriesId))
    .orderBy(asc(events.date))
    .all();

  const instancesWithCounts = await Promise.all(
    instances.map(async (event) => {
      const rsvpList = await db
        .select()
        .from(rsvps)
        .where(eq(rsvps.eventId, event.id))
        .all();

      const yesCount = rsvpList.filter((r) => r.status === "yes").length;

      return {
        ...event,
        rsvpCount: yesCount,
        isPast: event.date < today,
      };
    })
  );

  const recurrenceRule = parseRecurrenceRule(series.recurrenceRule);

  return json({
    series,
    instances: instancesWithCounts,
    recurrenceRule,
    recurrenceDescription: describeRecurrenceRule(recurrenceRule),
  });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const db = getDb(context?.cloudflare?.env?.DB);
  const seriesId = params.id;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (!seriesId) {
    return json({ error: "Series ID required" }, { status: 400 });
  }

  const series = await db
    .select()
    .from(eventSeries)
    .where(eq(eventSeries.id, seriesId))
    .get();

  if (!series) {
    return json({ error: "Series not found" }, { status: 404 });
  }

  if (intent === "update-series") {
    // Update series template
    const name = formData.get("name") as string;
    const timeStart = formData.get("timeStart") as string;
    const timeEnd = formData.get("timeEnd") as string | null;
    const location = formData.get("location") as string;
    const description = formData.get("description") as string;
    const capacityStr = formData.get("capacity") as string;
    const requiresWaiver = formData.get("requiresWaiver") === "on";
    const waiverText = formData.get("waiverText") as string | null;
    const discordLink = formData.get("discordLink") as string | null;
    const recurrenceRuleStr = formData.get("recurrenceRule") as string;
    const endType = formData.get("endType") as string;
    const endDate = formData.get("endDate") as string | null;
    const maxOccurrencesStr = formData.get("maxOccurrences") as string | null;

    const capacity = capacityStr ? parseInt(capacityStr, 10) : null;
    const maxOccurrences = maxOccurrencesStr ? parseInt(maxOccurrencesStr, 10) : null;

    // Update series
    await db
      .update(eventSeries)
      .set({
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
        endDate: endType === "date" ? endDate : null,
        maxOccurrences: endType === "count" ? maxOccurrences : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(eventSeries.id, seriesId))
      .run();

    // Update future non-exception instances
    const today = new Date().toISOString().split("T")[0];
    await db
      .update(events)
      .set({
        name: name.trim(),
        description: description.trim(),
        timeStart,
        timeEnd: timeEnd?.trim() || null,
        location: location.trim(),
        capacity,
        requiresWaiver,
        waiverText: waiverText?.trim() || null,
        discordLink: discordLink?.trim() || null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(events.seriesId, seriesId),
          eq(events.isSeriesException, false),
          gte(events.date, today)
        )
      )
      .run();

    return json({ success: true, message: "Series updated" });
  }

  if (intent === "pause-series") {
    await db
      .update(eventSeries)
      .set({ status: "paused", updatedAt: new Date().toISOString() })
      .where(eq(eventSeries.id, seriesId))
      .run();
    return json({ success: true, message: "Series paused" });
  }

  if (intent === "resume-series") {
    await db
      .update(eventSeries)
      .set({ status: "active", updatedAt: new Date().toISOString() })
      .where(eq(eventSeries.id, seriesId))
      .run();
    return json({ success: true, message: "Series resumed" });
  }

  if (intent === "end-series") {
    await db
      .update(eventSeries)
      .set({ status: "ended", updatedAt: new Date().toISOString() })
      .where(eq(eventSeries.id, seriesId))
      .run();
    return json({ success: true, message: "Series ended" });
  }

  if (intent === "generate-more") {
    // Generate more instances
    const recurrenceRule = parseRecurrenceRule(series.recurrenceRule);

    // Find the latest existing instance date
    const latestInstance = await db
      .select()
      .from(events)
      .where(eq(events.seriesId, seriesId))
      .orderBy(desc(events.date))
      .get();

    const startFrom = latestInstance
      ? latestInstance.date
      : series.startDate;

    const generateUntil = format(addMonths(new Date(), 6), "yyyy-MM-dd");

    // Get existing instance dates to avoid duplicates
    const existingInstances = await db
      .select({ date: events.seriesInstanceDate })
      .from(events)
      .where(eq(events.seriesId, seriesId))
      .all();

    const existingDates = new Set(existingInstances.map((i) => i.date));

    const newOccurrences = generateOccurrences({
      rule: recurrenceRule,
      startDate: startFrom,
      endDate: series.endDate,
      maxOccurrences: series.maxOccurrences,
      generateUntil,
    }).filter((date) => !existingDates.has(date));

    // Create new instances
    const baseSlug = slugify(series.name);
    let created = 0;

    for (const occurrenceDate of newOccurrences) {
      let slug = `${baseSlug}-${occurrenceDate}`;

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
          name: series.name,
          slug,
          description: series.description,
          date: occurrenceDate,
          timeStart: series.timeStart,
          timeEnd: series.timeEnd,
          location: series.location,
          capacity: series.capacity,
          requiresWaiver: series.requiresWaiver,
          waiverText: series.waiverText,
          discordLink: series.discordLink,
          status: "published",
          seriesId,
          seriesInstanceDate: occurrenceDate,
          isSeriesException: false,
        })
        .run();

      created++;
    }

    return json({
      success: true,
      message: created > 0
        ? `Generated ${created} new instance${created === 1 ? "" : "s"}`
        : "No new instances needed (already generated or end reached)",
    });
  }

  if (intent === "regenerate-instances") {
    // Delete future instances without RSVPs and regenerate with correct dates
    const today = new Date().toISOString().split("T")[0];
    const futureInstances = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.seriesId, seriesId),
          gte(events.date, today)
        )
      )
      .all();

    let deleted = 0;
    for (const instance of futureInstances) {
      const hasRsvps = await db
        .select()
        .from(rsvps)
        .where(eq(rsvps.eventId, instance.id))
        .get();

      if (!hasRsvps) {
        await db.delete(events).where(eq(events.id, instance.id)).run();
        deleted++;
      }
    }

    // Now generate new instances
    const recurrenceRule = parseRecurrenceRule(series.recurrenceRule);
    const generateUntil = format(addMonths(new Date(), 3), "yyyy-MM-dd");

    // Get remaining instance dates to avoid duplicates
    const existingInstances = await db
      .select({ date: events.seriesInstanceDate })
      .from(events)
      .where(eq(events.seriesId, seriesId))
      .all();

    const existingDates = new Set(existingInstances.map((i) => i.date));

    const newOccurrences = generateOccurrences({
      rule: recurrenceRule,
      startDate: today, // Start from today
      endDate: series.endDate,
      maxOccurrences: series.maxOccurrences,
      generateUntil,
    }).filter((date) => !existingDates.has(date));

    // Create new instances
    const baseSlug = slugify(series.name);
    let created = 0;

    for (const occurrenceDate of newOccurrences) {
      let slug = `${baseSlug}-${occurrenceDate}`;

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
          name: series.name,
          slug,
          description: series.description,
          date: occurrenceDate,
          timeStart: series.timeStart,
          timeEnd: series.timeEnd,
          location: series.location,
          capacity: series.capacity,
          requiresWaiver: series.requiresWaiver,
          waiverText: series.waiverText,
          discordLink: series.discordLink,
          status: "published",
          seriesId,
          seriesInstanceDate: occurrenceDate,
          isSeriesException: false,
        })
        .run();

      created++;
    }

    return json({
      success: true,
      message: `Regenerated instances: ${deleted} deleted, ${created} created`,
    });
  }

  if (intent === "delete-series") {
    // Delete all future instances without RSVPs
    const today = new Date().toISOString().split("T")[0];
    const futureInstances = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.seriesId, seriesId),
          gte(events.date, today)
        )
      )
      .all();

    for (const instance of futureInstances) {
      const hasRsvps = await db
        .select()
        .from(rsvps)
        .where(eq(rsvps.eventId, instance.id))
        .get();

      if (!hasRsvps) {
        await db.delete(events).where(eq(events.id, instance.id)).run();
      }
    }

    // Delete the series
    await db.delete(eventSeries).where(eq(eventSeries.id, seriesId)).run();

    return redirect("/admin/series");
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

export default function AdminSeriesDetail() {
  const { series, instances, recurrenceRule, recurrenceDescription } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [isEditing, setIsEditing] = useState(false);

  const upcomingInstances = instances.filter((i) => !i.isPast);
  const pastInstances = instances.filter((i) => i.isPast);

  const endType = series.endDate
    ? "date"
    : series.maxOccurrences
      ? "count"
      : "never";

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

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{series.name}</h1>
          <p className="mt-1 text-gray-500">{recurrenceDescription}</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                series.status === "active"
                  ? "bg-green-100 text-green-800"
                  : series.status === "paused"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-gray-100 text-gray-800"
              }`}
            >
              {series.status}
            </span>
            <span className="text-sm text-gray-500">
              {upcomingInstances.length} upcoming, {pastInstances.length} past
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {series.status === "active" && (
            <>
              <Form method="post">
                <input type="hidden" name="intent" value="regenerate-instances" />
                <button
                  type="submit"
                  className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  onClick={(e) => {
                    if (!confirm("This will delete future instances without RSVPs and regenerate them. Continue?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  Regenerate
                </button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="generate-more" />
                <button
                  type="submit"
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Generate More
                </button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="pause-series" />
                <button
                  type="submit"
                  className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100"
                >
                  Pause
                </button>
              </Form>
            </>
          )}
          {series.status === "paused" && (
            <Form method="post">
              <input type="hidden" name="intent" value="resume-series" />
              <button
                type="submit"
                className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
              >
                Resume
              </button>
            </Form>
          )}
          {series.status !== "ended" && (
            <Form method="post">
              <input type="hidden" name="intent" value="end-series" />
              <button
                type="submit"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                End Series
              </button>
            </Form>
          )}
        </div>
      </div>

      {/* Action feedback */}
      {actionData && "message" in actionData && (
        <div className="mt-4 rounded-md bg-green-50 p-3">
          <p className="text-sm text-green-800">{actionData.message}</p>
        </div>
      )}
      {actionData && "error" in actionData && (
        <div className="mt-4 rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{actionData.error}</p>
        </div>
      )}

      {/* Edit toggle */}
      <div className="mt-6 border-t border-gray-200 pt-6">
        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="text-sm font-medium text-primary hover:text-primary/80"
        >
          {isEditing ? "Cancel Editing" : "Edit Series Template"}
        </button>
      </div>

      {/* Edit form */}
      {isEditing && (
        <Form method="post" className="mt-4 space-y-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
          <input type="hidden" name="intent" value="update-series" />

          <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-md p-3">
            Changes to the template will apply to all future non-modified instances.
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Event Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              defaultValue={series.name}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="timeStart" className="block text-sm font-medium text-gray-700">
                Start Time
              </label>
              <input
                type="time"
                id="timeStart"
                name="timeStart"
                defaultValue={series.timeStart}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="timeEnd" className="block text-sm font-medium text-gray-700">
                End Time
              </label>
              <input
                type="time"
                id="timeEnd"
                name="timeEnd"
                defaultValue={series.timeEnd || ""}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Recurrence */}
          <RecurrenceForm
            defaultRule={recurrenceRule}
            defaultEndType={endType}
            defaultEndDate={series.endDate || undefined}
            defaultMaxOccurrences={series.maxOccurrences || undefined}
          />

          {/* Location */}
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700">
              Location
            </label>
            <input
              type="text"
              id="location"
              name="location"
              defaultValue={series.location}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={series.description}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Capacity */}
          <div>
            <label htmlFor="capacity" className="block text-sm font-medium text-gray-700">
              Capacity
            </label>
            <input
              type="number"
              id="capacity"
              name="capacity"
              min="1"
              defaultValue={series.capacity || ""}
              className="mt-1 block w-48 rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Waiver */}
          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="requiresWaiver"
                defaultChecked={series.requiresWaiver}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="ml-2 text-sm font-medium text-gray-700">
                Requires waiver signature
              </span>
            </label>
            <div>
              <label htmlFor="waiverText" className="block text-sm font-medium text-gray-700">
                Additional Waiver Terms
              </label>
              <textarea
                id="waiverText"
                name="waiverText"
                rows={2}
                defaultValue={series.waiverText || ""}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Discord */}
          <div>
            <label htmlFor="discordLink" className="block text-sm font-medium text-gray-700">
              Discord Invite Link
            </label>
            <input
              type="url"
              id="discordLink"
              name="discordLink"
              defaultValue={series.discordLink || ""}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium hover:bg-primary/90"
            >
              Update Series
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </Form>
      )}

      {/* Upcoming Instances */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">
          Upcoming Instances ({upcomingInstances.length})
        </h2>
        {upcomingInstances.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No upcoming instances</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    RSVPs
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {upcomingInstances.map((instance) => (
                  <tr key={instance.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="font-medium text-gray-900">
                        {formatDateShort(instance.date)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatTimeRange(instance.timeStart, instance.timeEnd)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <span className="font-medium text-gray-900">
                        {instance.rsvpCount}
                      </span>
                      {instance.capacity && (
                        <span className="text-gray-400">
                          /{instance.capacity}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            instance.status === "published"
                              ? "bg-green-100 text-green-800"
                              : instance.status === "draft"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {instance.status}
                        </span>
                        {instance.isSeriesException && (
                          <span className="inline-flex rounded-full bg-purple-100 px-2 text-xs font-semibold leading-5 text-purple-800">
                            modified
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <Link
                        to={`/admin/events/${instance.id}`}
                        className="text-primary hover:text-primary/80"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Past Instances */}
      {pastInstances.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">
            Past Instances ({pastInstances.length})
          </h2>
          <div className="mt-4 overflow-hidden rounded-lg bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Attendance
                  </th>
                  <th className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pastInstances.slice(0, 10).map((instance) => (
                  <tr key={instance.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatDateShort(instance.date)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {instance.rsvpCount} RSVPs
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <Link
                        to={`/admin/events/${instance.id}`}
                        className="text-primary hover:text-primary/80"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pastInstances.length > 10 && (
              <div className="bg-gray-50 px-6 py-3 text-center text-sm text-gray-500">
                Showing 10 of {pastInstances.length} past instances
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Series */}
      <div className="mt-12 border-t border-gray-200 pt-8">
        <h3 className="text-lg font-semibold text-red-600">Danger Zone</h3>
        <p className="mt-2 text-sm text-gray-500">
          Deleting this series will remove all future instances without RSVPs.
          Past instances and instances with RSVPs will be preserved as standalone events.
        </p>
        <Form method="post" className="mt-4">
          <input type="hidden" name="intent" value="delete-series" />
          <button
            type="submit"
            className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            onClick={(e) => {
              if (!confirm("Are you sure you want to delete this series?")) {
                e.preventDefault();
              }
            }}
          >
            Delete Series
          </button>
        </Form>
      </div>
    </div>
  );
}
