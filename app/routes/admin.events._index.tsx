import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { getDb } from "~/lib/db.server";
import { events, rsvps, eventSeries } from "~/lib/schema";
import { eq, desc } from "drizzle-orm";
import { formatDate, formatTimeRange } from "~/utils/date";

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDb(context?.cloudflare?.env.DB);

  const allEvents = await db
    .select()
    .from(events)
    .orderBy(desc(events.date))
    .all();

  // Get all series for lookup
  const allSeries = await db.select().from(eventSeries).all();
  const seriesMap = new Map(allSeries.map((s) => [s.id, s]));

  // Get RSVP counts for each event
  const eventsWithCounts = await Promise.all(
    allEvents.map(async (event) => {
      const rsvpList = await db
        .select()
        .from(rsvps)
        .where(eq(rsvps.eventId, event.id))
        .all();

      const yesCount = rsvpList.filter((r) => r.status === "yes").length;
      const waitlistCount = rsvpList.filter((r) => r.status === "waitlist").length;

      return {
        ...event,
        rsvpCount: yesCount,
        waitlistCount,
        seriesName: event.seriesId ? seriesMap.get(event.seriesId)?.name : null,
      };
    })
  );

  return json({ events: eventsWithCounts });
}

export default function AdminEvents() {
  const { events: eventList } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <Link
          to="/admin/events/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create Event
        </Link>
      </div>

      {eventList.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900">No events yet</h3>
          <p className="mt-2 text-gray-500">
            Get started by creating your first event.
          </p>
          <Link
            to="/admin/events/new"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Event
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Event
                </th>
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
              {eventList.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {event.name}
                        </span>
                        {event.seriesId && (
                          <span className="inline-flex rounded-full bg-purple-100 px-2 text-xs font-semibold leading-5 text-purple-800">
                            recurring
                          </span>
                        )}
                        {event.isSeriesException && (
                          <span className="inline-flex rounded-full bg-yellow-100 px-2 text-xs font-semibold leading-5 text-yellow-800">
                            modified
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {event.location}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatDate(event.date)} at{" "}
                    {formatTimeRange(event.timeStart, event.timeEnd)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    <span className="font-medium text-gray-900">
                      {event.rsvpCount}
                    </span>
                    {event.capacity && (
                      <span className="text-gray-400">
                        /{event.capacity}
                      </span>
                    )}
                    {event.waitlistCount > 0 && (
                      <span className="ml-2 text-yellow-600">
                        +{event.waitlistCount} waitlist
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        event.status === "published"
                          ? "bg-green-100 text-green-800"
                          : event.status === "draft"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {event.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <Link
                      to={`/admin/events/${event.id}`}
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
  );
}
