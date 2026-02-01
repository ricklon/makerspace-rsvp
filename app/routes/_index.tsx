import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { getDb } from "~/lib/db.server";
import { events } from "~/lib/schema";
import { sql } from "drizzle-orm";
import { formatDate, formatTimeRangeWithTimezone } from "~/utils/date";
import { UserMenu } from "~/components/UserMenu";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const makerspaceName = data?.makerspaceName || "Makerspace";
  return [
    { title: `${makerspaceName} Events - RSVP System` },
    {
      name: "description",
      content: `RSVP for events, workshops, and community gatherings at ${makerspaceName}`,
    },
  ];
};

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDb(context?.cloudflare?.env.DB);
  const makerspaceName = context?.cloudflare?.env.MAKERSPACE_NAME || "Makerspace";

  // Get upcoming published events
  const upcomingEvents = await db
    .select()
    .from(events)
    .where(sql`${events.status} = 'published' AND ${events.date} >= date('now')`)
    .orderBy(events.date);

  return json({ events: upcomingEvents, makerspaceName });
}

export default function Index() {
  const { events: upcomingEvents, makerspaceName } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">{makerspaceName} Events</h1>
            <nav className="flex items-center gap-4">
              <Link
                to="/admin"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Admin
              </Link>
              <UserMenu />
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Upcoming Events</h2>
          <p className="mt-2 text-gray-600">
            Workshops, maker events, and community gatherings
          </p>
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm">
            <p className="text-gray-600">No upcoming events at the moment.</p>
            <p className="mt-2 text-sm text-gray-500">Check back soon!</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {upcomingEvents.map((event) => (
              <Link
                key={event.id}
                to={`/events/${event.slug}`}
                className="group rounded-lg bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <h3 className="text-xl font-semibold text-gray-900 group-hover:text-primary">
                  {event.name}
                </h3>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <p>📅 {formatDate(event.date)}</p>
                  <p>🕐 {formatTimeRangeWithTimezone(event.timeStart, event.timeEnd)}</p>
                  <p>📍 {event.location}</p>
                  {event.capacity && (
                    <p className="text-xs text-gray-500">
                      Capacity: {event.capacity} attendees
                    </p>
                  )}
                </div>
                <p className="mt-4 line-clamp-2 text-sm text-gray-600">
                  {event.description}
                </p>
                <div className="mt-4 text-sm font-medium text-primary group-hover:text-primary/80">
                  RSVP Now →
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 bg-white border-t border-gray-200">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-gray-600 space-y-2">
            <p className="font-medium">{makerspaceName}</p>
            <p>New Jersey's First Hackerspace</p>
            <p>1510B Jersey Ave, North Brunswick, NJ 08902</p>
            <div className="flex justify-center gap-4 mt-4">
              <a
                href="https://fubarlabs.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80"
              >
                Website
              </a>
              <a
                href="https://discord.gg/dVs42Xz9Ns"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80"
              >
                Discord
              </a>
            </div>
            <p className="mt-4 text-gray-500">
              © {new Date().getFullYear()} Fair Use Building and Research Labs
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
