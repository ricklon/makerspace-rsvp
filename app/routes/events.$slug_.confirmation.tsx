import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { eq, and } from "drizzle-orm";
import { QRCodeSVG } from "qrcode.react";
import { getDb } from "~/lib/db.server";
import { events, attendees, rsvps, waivers } from "~/lib/schema";
import { formatDate, formatTimeRange } from "~/utils/date";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.event) {
    return [{ title: "Confirmation" }];
  }
  return [
    { title: `Confirmed - ${data.event.name}` },
    { name: "description", content: `Your registration for ${data.event.name} is confirmed` },
  ];
};

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context?.cloudflare?.env.DB);
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

  // Look up RSVP by token
  const rsvp = await db
    .select()
    .from(rsvps)
    .where(eq(rsvps.confirmationToken, token))
    .get();

  if (!rsvp || rsvp.eventId !== event.id) {
    return redirect(`/events/${slug}`);
  }

  // Get attendee
  const attendee = await db
    .select()
    .from(attendees)
    .where(eq(attendees.id, rsvp.attendeeId))
    .get();

  if (!attendee) {
    return redirect(`/events/${slug}`);
  }

  // Check waiver status if required
  let waiverSigned = false;
  if (event.requiresWaiver) {
    const waiver = await db
      .select()
      .from(waivers)
      .where(and(eq(waivers.eventId, event.id), eq(waivers.attendeeId, attendee.id)))
      .get();
    waiverSigned = !!waiver;

    // If waiver not signed, redirect to waiver page
    if (!waiverSigned) {
      return redirect(`/events/${slug}/waiver?token=${token}`);
    }
  }

  // Build check-in URL
  const baseUrl = url.origin;
  const checkinUrl = `${baseUrl}/events/${slug}/checkin?token=${rsvp.checkinToken}`;

  return json({
    event,
    attendee: { name: attendee.name, email: attendee.email },
    rsvp: { status: rsvp.status, notes: rsvp.notes },
    waiverSigned,
    checkinUrl,
  });
}

export default function ConfirmationPage() {
  const { event, attendee, rsvp, waiverSigned, checkinUrl } = useLoaderData<typeof loader>();

  const isWaitlist = rsvp.status === "waitlist";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <Link to="/" className="text-sm text-blue-600 hover:text-blue-800">
            &larr; Back to Events
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white p-8 shadow-sm text-center">
          {/* Success Icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
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

          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            {isWaitlist ? "You're on the Waitlist!" : "You're Registered!"}
          </h1>

          <p className="mt-2 text-gray-600">
            {isWaitlist
              ? "We'll notify you if a spot opens up."
              : "See you at the event!"}
          </p>

          {/* Event Details */}
          <div className="mt-8 rounded-lg bg-gray-50 p-6 text-left">
            <h2 className="text-lg font-semibold text-gray-900">{event.name}</h2>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <p className="flex items-center gap-2">
                <span>📅</span>
                {formatDate(event.date)}
              </p>
              <p className="flex items-center gap-2">
                <span>🕐</span>
                {formatTimeRange(event.timeStart, event.timeEnd)}
              </p>
              <p className="flex items-center gap-2">
                <span>📍</span>
                {event.location}
              </p>
            </div>
          </div>

          {/* Attendee Details */}
          <div className="mt-6 rounded-lg border border-gray-200 p-4 text-left">
            <h3 className="text-sm font-medium text-gray-900">Registration Details</h3>
            <dl className="mt-2 text-sm">
              <div className="flex justify-between py-1">
                <dt className="text-gray-500">Name</dt>
                <dd className="text-gray-900">{attendee.name}</dd>
              </div>
              <div className="flex justify-between py-1">
                <dt className="text-gray-500">Email</dt>
                <dd className="text-gray-900">{attendee.email}</dd>
              </div>
              <div className="flex justify-between py-1">
                <dt className="text-gray-500">Status</dt>
                <dd>
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      isWaitlist
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {isWaitlist ? "Waitlist" : "Confirmed"}
                  </span>
                </dd>
              </div>
              {event.requiresWaiver && (
                <div className="flex justify-between py-1">
                  <dt className="text-gray-500">Waiver</dt>
                  <dd>
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                      Signed
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* QR Code for Check-in */}
          {!isWaitlist && (
            <div className="mt-8 rounded-lg border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                Check-in QR Code
              </h3>
              <div className="flex justify-center">
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <QRCodeSVG
                    value={checkinUrl}
                    size={180}
                    level="M"
                    includeMargin={true}
                  />
                </div>
              </div>
              <p className="mt-4 text-xs text-gray-500 text-center">
                Show this QR code at the event to check in
              </p>

              {/* Check-in URL */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 text-center mb-1">
                  Or use this link to check in:
                </p>
                <a
                  href={checkinUrl}
                  className="text-xs text-blue-600 hover:text-blue-800 break-all text-center block"
                >
                  {checkinUrl}
                </a>
              </div>

              <p className="mt-3 text-xs text-gray-400 text-center">
                Screenshot this page or save the QR code for the event
              </p>
            </div>
          )}

          {/* What's Next */}
          <div className="mt-8 text-left">
            <h3 className="text-sm font-medium text-gray-900">What's Next?</h3>
            <ul className="mt-2 list-inside list-disc text-sm text-gray-600 space-y-1">
              <li>Check your email for confirmation details</li>
              {!isWaitlist && <li>Add the event to your calendar</li>}
              {event.discordLink && (
                <li>
                  <a
                    href={event.discordLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Join our Discord
                  </a>{" "}
                  for updates and announcements
                </li>
              )}
              {isWaitlist && (
                <li>Keep an eye on your email - we'll notify you if a spot opens</li>
              )}
            </ul>
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/"
              className="rounded-md bg-blue-600 px-6 py-2 text-white font-medium hover:bg-blue-700"
            >
              Browse More Events
            </Link>
            <Link
              to={`/events/${event.slug}`}
              className="rounded-md border border-gray-300 px-6 py-2 text-gray-700 font-medium hover:bg-gray-50"
            >
              View Event Details
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
