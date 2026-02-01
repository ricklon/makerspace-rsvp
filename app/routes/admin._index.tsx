import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { getDb } from "~/lib/db.server";
import { events, rsvps, attendance } from "~/lib/schema";
import { eq, and, gte } from "drizzle-orm";

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDb(context?.cloudflare?.env.DB);
  const today = new Date().toISOString().split("T")[0];

  // Get upcoming events
  const upcomingEvents = await db
    .select()
    .from(events)
    .where(gte(events.date, today))
    .all();

  // Get stats
  const allEvents = await db.select().from(events).all();
  const allRsvps = await db.select().from(rsvps).where(eq(rsvps.status, "yes")).all();
  const allAttendance = await db.select().from(attendance).all();

  return json({
    stats: {
      totalEvents: allEvents.length,
      upcomingEvents: upcomingEvents.length,
      totalRsvps: allRsvps.length,
      totalCheckins: allAttendance.length,
    },
    upcomingEvents: upcomingEvents.slice(0, 5),
  });
}

export default function AdminDashboard() {
  const { stats, upcomingEvents } = useLoaderData<typeof loader>();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats Grid */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Events" value={stats.totalEvents} />
        <StatCard title="Upcoming Events" value={stats.upcomingEvents} />
        <StatCard title="Total RSVPs" value={stats.totalRsvps} />
        <StatCard title="Total Check-ins" value={stats.totalCheckins} />
      </div>

      {/* Upcoming Events */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Upcoming Events</h2>
          <Link
            to="/admin/events/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Event
          </Link>
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p className="text-gray-500">No upcoming events</p>
            <Link
              to="/admin/events/new"
              className="mt-2 inline-block text-sm text-primary hover:text-primary/80"
            >
              Create your first event
            </Link>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg bg-white shadow">
            <ul className="divide-y divide-gray-200">
              {upcomingEvents.map((event) => (
                <li key={event.id}>
                  <Link
                    to={`/admin/events/${event.id}`}
                    className="block hover:bg-gray-50"
                  >
                    <div className="px-4 py-4 sm:px-6">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium text-primary">
                          {event.name}
                        </p>
                        <div className="ml-2 flex flex-shrink-0">
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
                        </div>
                      </div>
                      <div className="mt-2 sm:flex sm:justify-between">
                        <div className="sm:flex">
                          <p className="flex items-center text-sm text-gray-500">
                            {new Date(event.date).toLocaleDateString()} at{" "}
                            {event.timeStart}
                          </p>
                        </div>
                        <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                          {event.location}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
      <dt className="truncate text-sm font-medium text-gray-500">{title}</dt>
      <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
        {value}
      </dd>
    </div>
  );
}
