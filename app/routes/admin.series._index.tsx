import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { getDb } from "~/lib/db.server";
import { eventSeries, events } from "~/lib/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { parseRecurrenceRule, describeRecurrenceRule } from "~/lib/recurrence";

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDb(context?.cloudflare?.env.DB);

  const allSeries = await db
    .select()
    .from(eventSeries)
    .orderBy(desc(eventSeries.createdAt))
    .all();

  // Get instance counts for each series
  const today = new Date().toISOString().split("T")[0];
  const seriesWithCounts = await Promise.all(
    allSeries.map(async (series) => {
      // Get total instances
      const totalInstances = await db
        .select()
        .from(events)
        .where(eq(events.seriesId, series.id))
        .all();

      // Get upcoming instances
      const upcomingInstances = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.seriesId, series.id),
            gte(events.date, today)
          )
        )
        .all();

      return {
        ...series,
        totalCount: totalInstances.length,
        upcomingCount: upcomingInstances.length,
        recurrenceDescription: describeRecurrenceRule(
          parseRecurrenceRule(series.recurrenceRule)
        ),
      };
    })
  );

  return json({ series: seriesWithCounts });
}

export default function AdminSeriesIndex() {
  const { series } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recurring Events</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage event series that repeat on a schedule
          </p>
        </div>
        <Link
          to="/admin/series/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create Recurring Event
        </Link>
      </div>

      {series.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <div className="text-4xl mb-4">🔄</div>
          <h3 className="text-lg font-medium text-gray-900">No recurring events yet</h3>
          <p className="mt-2 text-gray-500">
            Create a recurring event to automatically generate event instances on a schedule.
          </p>
          <Link
            to="/admin/series/new"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Recurring Event
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Series
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Schedule
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Instances
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
              {series.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{s.name}</div>
                      <div className="text-sm text-gray-500">{s.location}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div>{s.recurrenceDescription}</div>
                    <div className="text-xs text-gray-400">
                      Starting {new Date(s.startDate).toLocaleDateString()}
                      {s.endDate && ` until ${new Date(s.endDate).toLocaleDateString()}`}
                      {s.maxOccurrences && ` (${s.maxOccurrences} occurrences)`}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    <span className="font-medium text-gray-900">{s.upcomingCount}</span>
                    <span className="text-gray-400"> upcoming</span>
                    <span className="mx-1 text-gray-300">/</span>
                    <span>{s.totalCount}</span>
                    <span className="text-gray-400"> total</span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        s.status === "active"
                          ? "bg-green-100 text-green-800"
                          : s.status === "paused"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <Link
                      to={`/admin/series/${s.id}`}
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
