import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useActionData, Form, Link } from "@remix-run/react";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/lib/db.server";
import { events, attendees, rsvps, attendance, waivers } from "~/lib/schema";
import { formatDate, formatTimeRange } from "~/utils/date";

type LoaderData = {
  event: {
    name: string;
    slug: string;
    date: string;
    timeStart: string;
    timeEnd: string | null;
    location: string;
    requiresWaiver: boolean;
  };
  attendee: { name: string; email: string };
  alreadyCheckedIn: boolean;
  waiverSigned: boolean;
};

type ActionData = {
  success: true;
  message: string;
} | {
  success: false;
  error: string;
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.event) {
    return [{ title: "Check In" }];
  }
  return [
    { title: `Check In - ${data.event.name}` },
    { name: "description", content: `Check in for ${data.event.name}` },
  ];
};

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context?.cloudflare?.env?.DB);
  const { slug } = params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  if (!token) {
    return redirect(`/events/${slug}`);
  }

  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.status, "published")))
    .get();

  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  // Look up RSVP by check-in token
  const rsvp = await db
    .select()
    .from(rsvps)
    .where(eq(rsvps.checkinToken, token))
    .get();

  if (!rsvp || rsvp.eventId !== event.id) {
    throw new Response("Invalid check-in link", { status: 400 });
  }

  // Get attendee
  const attendee = await db
    .select()
    .from(attendees)
    .where(eq(attendees.id, rsvp.attendeeId))
    .get();

  if (!attendee) {
    throw new Response("Attendee not found", { status: 400 });
  }

  // Check if already checked in
  const existingCheckin = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.eventId, event.id), eq(attendance.attendeeId, attendee.id)))
    .get();

  // Check waiver status if required
  let waiverSigned = false;
  if (event.requiresWaiver) {
    const waiver = await db
      .select()
      .from(waivers)
      .where(and(eq(waivers.eventId, event.id), eq(waivers.attendeeId, attendee.id)))
      .get();
    waiverSigned = !!waiver;
  }

  return json<LoaderData>({
    event: {
      name: event.name,
      slug: event.slug,
      date: event.date,
      timeStart: event.timeStart,
      timeEnd: event.timeEnd,
      location: event.location,
      requiresWaiver: event.requiresWaiver,
    },
    attendee: { name: attendee.name, email: attendee.email },
    alreadyCheckedIn: !!existingCheckin,
    waiverSigned,
  });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context?.cloudflare?.env?.DB);
  const { slug } = params;
  const formData = await request.formData();
  const token = formData.get("token") as string;

  if (!slug || !token) {
    return json<ActionData>({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.status, "published")))
    .get();

  if (!event) {
    return json<ActionData>({ success: false, error: "Event not found" }, { status: 404 });
  }

  // Look up RSVP by check-in token
  const rsvp = await db
    .select()
    .from(rsvps)
    .where(eq(rsvps.checkinToken, token))
    .get();

  if (!rsvp || rsvp.eventId !== event.id) {
    return json<ActionData>({ success: false, error: "Invalid check-in link" }, { status: 400 });
  }

  // Get attendee
  const attendee = await db
    .select()
    .from(attendees)
    .where(eq(attendees.id, rsvp.attendeeId))
    .get();

  if (!attendee) {
    return json<ActionData>({ success: false, error: "Attendee not found" }, { status: 400 });
  }

  // Check waiver if required
  if (event.requiresWaiver) {
    const waiver = await db
      .select()
      .from(waivers)
      .where(and(eq(waivers.eventId, event.id), eq(waivers.attendeeId, attendee.id)))
      .get();

    if (!waiver) {
      return json<ActionData>(
        { success: false, error: "Please sign the waiver before checking in" },
        { status: 400 }
      );
    }
  }

  // Check if already checked in
  const existingCheckin = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.eventId, event.id), eq(attendance.attendeeId, attendee.id)))
    .get();

  if (existingCheckin) {
    return json<ActionData>({ success: true, message: "You're already checked in!" });
  }

  // Create attendance record
  await db
    .insert(attendance)
    .values({
      eventId: event.id,
      attendeeId: attendee.id,
      checkInMethod: "qr_code",
    })
    .run();

  return json<ActionData>({ success: true, message: "Successfully checked in!" });
}

export default function CheckinPage() {
  const { event, attendee, alreadyCheckedIn, waiverSigned } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
  const token = url?.searchParams.get("token") || "";

  const showSuccess = actionData?.success || alreadyCheckedIn;
  const needsWaiver = event.requiresWaiver && !waiverSigned;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
          <Link to="/" className="text-sm text-blue-600 hover:text-blue-800">
            &larr; Back to Events
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6">
        <div className="rounded-lg bg-white p-8 shadow-sm text-center">
          {showSuccess ? (
            <>
              {/* Success State */}
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-10 w-10 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>

              <h1 className="mt-6 text-2xl font-bold text-gray-900">
                You're Checked In!
              </h1>

              <p className="mt-2 text-gray-600">
                Welcome, {attendee.name}!
              </p>

              <div className="mt-6 rounded-lg bg-gray-50 p-4 text-left">
                <h2 className="font-semibold text-gray-900">{event.name}</h2>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <p>📅 {formatDate(event.date)}</p>
                  <p>🕐 {formatTimeRange(event.timeStart, event.timeEnd)}</p>
                  <p>📍 {event.location}</p>
                </div>
              </div>

              <p className="mt-6 text-sm text-gray-500">
                Enjoy the event!
              </p>
            </>
          ) : needsWaiver ? (
            <>
              {/* Waiver Required State */}
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-yellow-100">
                <svg
                  className="h-10 w-10 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>

              <h1 className="mt-6 text-2xl font-bold text-gray-900">
                Waiver Required
              </h1>

              <p className="mt-2 text-gray-600">
                Please sign the waiver before checking in.
              </p>

              <Link
                to={`/events/${event.slug}`}
                className="mt-6 inline-block rounded-md bg-blue-600 px-6 py-2 text-white font-medium hover:bg-blue-700"
              >
                Go to Event Page
              </Link>
            </>
          ) : (
            <>
              {/* Check-in Form */}
              <h1 className="text-2xl font-bold text-gray-900">Event Check-In</h1>

              <div className="mt-6 rounded-lg bg-gray-50 p-4 text-left">
                <h2 className="font-semibold text-gray-900">{event.name}</h2>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <p>📅 {formatDate(event.date)}</p>
                  <p>🕐 {formatTimeRange(event.timeStart, event.timeEnd)}</p>
                  <p>📍 {event.location}</p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-gray-200 p-4 text-left">
                <p className="text-sm text-gray-500">Checking in as:</p>
                <p className="mt-1 font-medium text-gray-900">{attendee.name}</p>
                <p className="text-sm text-gray-500">{attendee.email}</p>
              </div>

              {actionData && !actionData.success && (
                <div className="mt-4 rounded-lg bg-red-50 p-4">
                  <p className="text-sm text-red-700">{actionData.error}</p>
                </div>
              )}

              <Form method="post" className="mt-6">
                <input type="hidden" name="token" value={token} />
                <button
                  type="submit"
                  className="w-full rounded-md bg-green-600 px-6 py-3 text-lg font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  Check In Now
                </button>
              </Form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
