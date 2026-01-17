import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useActionData, Form, Link } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/lib/db.server";
import { events, rsvps, attendees, waivers, attendance } from "~/lib/schema";

type ActionData = {
  success: true;
  message: string;
} | {
  success: false;
  errors: Record<string, string>;
} | null;

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = getDb(context?.cloudflare?.env.DB);
  const { id } = params;

  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const event = await db.select().from(events).where(eq(events.id, id)).get();

  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  // Get RSVPs with attendee info
  const rsvpList = await db
    .select()
    .from(rsvps)
    .innerJoin(attendees, eq(rsvps.attendeeId, attendees.id))
    .where(eq(rsvps.eventId, id))
    .all();

  // Get attendance records
  const attendanceList = await db
    .select()
    .from(attendance)
    .where(eq(attendance.eventId, id))
    .all();

  // Get waiver records
  const waiverList = await db
    .select()
    .from(waivers)
    .where(eq(waivers.eventId, id))
    .all();

  const checkedInIds = new Set(attendanceList.map((a) => a.attendeeId));
  const waiverSignedIds = new Set(waiverList.map((w) => w.attendeeId));

  const enrichedRsvps = rsvpList.map((row) => ({
    ...row.rsvps,
    attendeeName: row.attendees.name,
    attendeeEmail: row.attendees.email,
    waiverSigned: waiverSignedIds.has(row.attendees.id),
    checkedIn: checkedInIds.has(row.attendees.id),
  }));

  const stats = {
    total: rsvpList.length,
    yes: rsvpList.filter((r) => r.rsvps.status === "yes").length,
    waitlist: rsvpList.filter((r) => r.rsvps.status === "waitlist").length,
    checkedIn: attendanceList.length,
    waiverSigned: waiverList.length,
  };

  return json({ event, rsvps: enrichedRsvps, stats });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context?.cloudflare?.env.DB);
  const { id } = params;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  if (intent === "update") {
    const name = formData.get("name") as string;
    const date = formData.get("date") as string;
    const timeStart = formData.get("timeStart") as string;
    const timeEnd = formData.get("timeEnd") as string | null;
    const location = formData.get("location") as string;
    const description = formData.get("description") as string;
    const capacityStr = formData.get("capacity") as string;
    const requiresWaiver = formData.get("requiresWaiver") === "on";
    const waiverText = formData.get("waiverText") as string | null;
    const discordLink = formData.get("discordLink") as string | null;
    const status = formData.get("status") as "draft" | "published" | "cancelled";

    const errors: Record<string, string> = {};
    if (!name?.trim()) errors.name = "Name is required";
    if (!date) errors.date = "Date is required";
    if (!timeStart) errors.timeStart = "Start time is required";
    if (!location?.trim()) errors.location = "Location is required";
    if (!description?.trim()) errors.description = "Description is required";

    if (Object.keys(errors).length > 0) {
      return json<ActionData>({ success: false, errors }, { status: 400 });
    }

    await db
      .update(events)
      .set({
        name: name.trim(),
        date,
        timeStart,
        timeEnd: timeEnd?.trim() || null,
        location: location.trim(),
        description: description.trim(),
        capacity: capacityStr ? parseInt(capacityStr, 10) : null,
        requiresWaiver,
        waiverText: waiverText?.trim() || null,
        discordLink: discordLink?.trim() || null,
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(events.id, id))
      .run();

    return json<ActionData>({ success: true, message: "Event updated successfully" });
  }

  if (intent === "delete") {
    await db.delete(events).where(eq(events.id, id)).run();
    return redirect("/admin/events");
  }

  if (intent === "checkin") {
    const attendeeId = formData.get("attendeeId") as string;

    // Check if already checked in
    const existing = await db
      .select()
      .from(attendance)
      .where(eq(attendance.attendeeId, attendeeId))
      .get();

    if (!existing) {
      await db
        .insert(attendance)
        .values({
          eventId: id,
          attendeeId,
          checkInMethod: "manual",
        })
        .run();
    }

    return json<ActionData>({ success: true, message: "Attendee checked in" });
  }

  return null;
}

export default function AdminEventDetail() {
  const { event, rsvps: rsvpList, stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/admin/events"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Back to Events
        </Link>
      </div>

      {actionData?.success && (
        <div className="mb-6 rounded-lg bg-green-50 p-4">
          <p className="text-sm text-green-800">{actionData.message}</p>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Event Details Form */}
        <div className="lg:col-span-2">
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-medium text-gray-900">Event Details</h2>

            <Form method="post" className="mt-6 space-y-6">
              <input type="hidden" name="intent" value="update" />

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Event Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  defaultValue={event.name}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                    Date *
                  </label>
                  <input
                    type="date"
                    id="date"
                    name="date"
                    defaultValue={event.date}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="timeStart" className="block text-sm font-medium text-gray-700">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    id="timeStart"
                    name="timeStart"
                    defaultValue={event.timeStart}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    defaultValue={event.timeEnd || ""}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                  Location *
                </label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  defaultValue={event.location}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description *
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  defaultValue={event.description}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="capacity" className="block text-sm font-medium text-gray-700">
                  Capacity
                </label>
                <input
                  type="number"
                  id="capacity"
                  name="capacity"
                  min="1"
                  defaultValue={event.capacity || ""}
                  className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-4 rounded-lg border border-gray-200 p-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="requiresWaiver"
                    defaultChecked={event.requiresWaiver}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
                    rows={3}
                    defaultValue={event.waiverText || ""}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="discordLink" className="block text-sm font-medium text-gray-700">
                  Discord Invite Link
                </label>
                <input
                  type="url"
                  id="discordLink"
                  name="discordLink"
                  defaultValue={event.discordLink || ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={event.status}
                  className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-6 py-2 text-white font-medium hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </Form>

            {/* Delete */}
            <div className="mt-8 border-t border-gray-200 pt-6">
              <h3 className="text-sm font-medium text-red-600">Danger Zone</h3>
              <Form method="post" className="mt-4">
                <input type="hidden" name="intent" value="delete" />
                <button
                  type="submit"
                  className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  onClick={(e) => {
                    if (!confirm("Are you sure you want to delete this event? This cannot be undone.")) {
                      e.preventDefault();
                    }
                  }}
                >
                  Delete Event
                </button>
              </Form>
            </div>
          </div>
        </div>

        {/* Stats & RSVPs */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900">Quick Stats</h3>
            <dl className="mt-4 space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Confirmed RSVPs</dt>
                <dd className="text-sm font-medium text-gray-900">{stats.yes}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Waitlist</dt>
                <dd className="text-sm font-medium text-yellow-600">{stats.waitlist}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Waivers Signed</dt>
                <dd className="text-sm font-medium text-gray-900">{stats.waiverSigned}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Checked In</dt>
                <dd className="text-sm font-medium text-green-600">{stats.checkedIn}</dd>
              </div>
            </dl>

            {/* QR Scanner Button */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <Link
                to={`/admin/events/${event.id}/scan`}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-3 text-white font-medium hover:bg-green-700"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Scan QR Codes
              </Link>
            </div>
            {event.status === "published" && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">Public URL:</p>
                <a
                  href={`/events/${event.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 break-all"
                >
                  /events/{event.slug}
                </a>
              </div>
            )}
          </div>

          {/* RSVP List */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900">RSVPs ({rsvpList.length})</h3>
            {rsvpList.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No RSVPs yet</p>
            ) : (
              <ul className="mt-4 divide-y divide-gray-200">
                {rsvpList.map((rsvp) => (
                  <li key={rsvp.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {rsvp.attendeeName}
                        </p>
                        <p className="text-xs text-gray-500">{rsvp.attendeeEmail}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {rsvp.checkedIn ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                            Checked In
                          </span>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="checkin" />
                            <input type="hidden" name="attendeeId" value={rsvp.attendeeId} />
                            <button
                              type="submit"
                              className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
                            >
                              Check In
                            </button>
                          </Form>
                        )}
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            rsvp.status === "yes"
                              ? "bg-green-100 text-green-800"
                              : rsvp.status === "waitlist"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {rsvp.status}
                        </span>
                      </div>
                    </div>
                    {event.requiresWaiver && (
                      <p className="mt-1 text-xs text-gray-400">
                        Waiver: {rsvp.waiverSigned ? "Signed" : "Not signed"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
