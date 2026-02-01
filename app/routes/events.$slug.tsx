import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useActionData, Form, Link } from "@remix-run/react";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/lib/db.server";
import { events, attendees, rsvps } from "~/lib/schema";
import { rsvpFormSchema, parseFormData } from "~/utils/validation";
import { formatDate, formatTimeRangeWithTimezone, isEventInPast } from "~/utils/date";
import { sendEmail, buildRsvpConfirmationEmail } from "~/lib/email.server";
import { getAuth } from "@clerk/remix/ssr.server";
import { SignInButton, useUser } from "@clerk/remix";

type ActionData =
  | { success: true; message: string; isWaitlist: boolean }
  | { success: false; errors: Record<string, string> };

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.event) {
    return [{ title: "Event Not Found" }];
  }
  return [
    { title: `${data.event.name} - RSVP` },
    { name: "description", content: data.event.description },
  ];
};

export async function loader(args: LoaderFunctionArgs) {
  const { params, context } = args;
  const db = getDb(context?.cloudflare?.env.DB);
  const { slug } = params;

  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.status, "published")))
    .get();

  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  // Get RSVP count
  const rsvpList = await db
    .select()
    .from(rsvps)
    .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "yes")))
    .all();

  const rsvpCount = rsvpList.length;
  const spotsRemaining = event.capacity ? event.capacity - rsvpCount : null;
  const isAtCapacity = event.capacity !== null && rsvpCount >= event.capacity;

  // Get Clerk user info if signed in
  const { userId } = await getAuth(args);

  return json({
    event,
    rsvpCount,
    spotsRemaining,
    isAtCapacity,
    isSignedIn: !!userId,
  });
}

export async function action(args: ActionFunctionArgs) {
  const { params, request, context } = args;
  const db = getDb(context?.cloudflare?.env.DB);
  const { slug } = params;

  // Get Clerk user if signed in
  const { userId: clerkUserId } = await getAuth(args);

  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  // Get the event
  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.status, "published")))
    .get();

  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  // Check if event is in the past
  if (isEventInPast(event.date)) {
    return json<ActionData>(
      { success: false, errors: { form: "This event has already passed" } },
      { status: 400 }
    );
  }

  // Parse and validate form data
  const formData = await request.formData();
  const result = parseFormData(formData, rsvpFormSchema);

  if (!result.success) {
    return json<ActionData>({ success: false, errors: result.errors }, { status: 400 });
  }

  const { name, email, notes } = result.data;

  // Check RSVP count for capacity
  const rsvpList = await db
    .select()
    .from(rsvps)
    .where(and(eq(rsvps.eventId, event.id), eq(rsvps.status, "yes")))
    .all();

  const rsvpCount = rsvpList.length;
  const isAtCapacity = event.capacity !== null && rsvpCount >= event.capacity;

  // Find or create attendee
  let attendee = await db
    .select()
    .from(attendees)
    .where(eq(attendees.email, email.toLowerCase()))
    .get();

  if (!attendee) {
    const newAttendee = await db
      .insert(attendees)
      .values({
        email: email.toLowerCase(),
        name,
        clerkUserId: clerkUserId || null,
      })
      .returning()
      .get();
    attendee = newAttendee;
  } else if (clerkUserId && !attendee.clerkUserId) {
    // Link existing attendee to Clerk user if they sign in later
    await db
      .update(attendees)
      .set({ clerkUserId, name })
      .where(eq(attendees.id, attendee.id))
      .run();
    attendee = { ...attendee, clerkUserId, name };
  }

  // Check for existing RSVP
  const existingRsvp = await db
    .select()
    .from(rsvps)
    .where(and(eq(rsvps.eventId, event.id), eq(rsvps.attendeeId, attendee.id)))
    .get();

  if (existingRsvp) {
    // Update existing RSVP
    await db
      .update(rsvps)
      .set({
        status: isAtCapacity ? "waitlist" : "yes",
        notes: notes || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(rsvps.id, existingRsvp.id))
      .run();

    // If event requires waiver and not signed, redirect to waiver
    if (event.requiresWaiver) {
      return redirect(`/events/${slug}/waiver?token=${existingRsvp.confirmationToken}`);
    }

    // Send confirmation email for existing RSVP update
    const baseUrl = new URL(request.url).origin;
    const confirmationUrl = `${baseUrl}/events/${slug}/confirmation?token=${existingRsvp.confirmationToken}`;

    const emailContent = buildRsvpConfirmationEmail({
      attendeeName: name,
      eventName: event.name,
      eventDate: formatDate(event.date),
      eventTime: formatTimeRangeWithTimezone(event.timeStart, event.timeEnd),
      eventLocation: event.location,
      confirmationUrl,
      isWaitlist: isAtCapacity,
      requiresWaiver: false,
      makerspaceName: "Fubar Labs",
    });

    const sendgridApiKey = context?.cloudflare?.env?.SENDGRID_API_KEY as string | undefined;
    const fromEmail = context?.cloudflare?.env?.FROM_EMAIL as string || "events@fubarlabs.org";

    sendEmail(
      {
        to: { email: email.toLowerCase(), name },
        from: { email: fromEmail, name: "Fubar Labs" },
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      },
      sendgridApiKey || ""
    ).catch((err) => console.error("[rsvp] Failed to send email:", err));

    // Redirect to confirmation page with token
    return redirect(`/events/${slug}/confirmation?token=${existingRsvp.confirmationToken}`);
  }

  // Create new RSVP
  const newRsvp = await db
    .insert(rsvps)
    .values({
      eventId: event.id,
      attendeeId: attendee.id,
      status: isAtCapacity ? "waitlist" : "yes",
      notes: notes || null,
    })
    .returning()
    .get();

  // If event requires waiver, redirect to waiver page (email sent after waiver signed)
  if (event.requiresWaiver) {
    return redirect(`/events/${slug}/waiver?token=${newRsvp.confirmationToken}`);
  }

  // Send confirmation email (no waiver required)
  const baseUrl = new URL(request.url).origin;
  const confirmationUrl = `${baseUrl}/events/${slug}/confirmation?token=${newRsvp.confirmationToken}`;

  const emailContent = buildRsvpConfirmationEmail({
    attendeeName: name,
    eventName: event.name,
    eventDate: formatDate(event.date),
    eventTime: formatTimeRangeWithTimezone(event.timeStart, event.timeEnd),
    eventLocation: event.location,
    confirmationUrl,
    isWaitlist: isAtCapacity,
    requiresWaiver: false,
    makerspaceName: "Fubar Labs",
  });

  const sendgridApiKey = context?.cloudflare?.env?.SENDGRID_API_KEY as string | undefined;
  const fromEmail = context?.cloudflare?.env?.FROM_EMAIL as string || "events@fubarlabs.org";

  // Send email in background (don't block redirect)
  sendEmail(
    {
      to: { email: email.toLowerCase(), name },
      from: { email: fromEmail, name: "Fubar Labs" },
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    },
    sendgridApiKey || ""
  ).catch((err) => console.error("[rsvp] Failed to send email:", err));

  // Redirect to confirmation page with token
  return redirect(`/events/${slug}/confirmation?token=${newRsvp.confirmationToken}`);
}

export default function EventDetail() {
  const { event, rsvpCount, spotsRemaining, isAtCapacity, isSignedIn } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const { user } = useUser();

  const isPast = isEventInPast(event.date);

  // Auto-fill values from Clerk user if signed in
  const defaultName = user?.fullName || user?.firstName || "";
  const defaultEmail = user?.primaryEmailAddress?.emailAddress || "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="text-sm text-primary hover:text-primary/80"
          >
            &larr; Back to Events
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Event Details */}
          <div className="lg:col-span-2">
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>

              <div className="mt-4 space-y-2 text-gray-600">
                <p className="flex items-center gap-2">
                  <span className="text-lg">📅</span>
                  {formatDate(event.date)}
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-lg">🕐</span>
                  {formatTimeRangeWithTimezone(event.timeStart, event.timeEnd)}
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-lg">📍</span>
                  {event.location}
                </p>
                {event.capacity && (
                  <p className="flex items-center gap-2">
                    <span className="text-lg">👥</span>
                    {spotsRemaining !== null && spotsRemaining > 0
                      ? `${spotsRemaining} spots remaining`
                      : "Event is full (waitlist available)"}
                    <span className="text-sm text-gray-500">
                      ({rsvpCount}/{event.capacity} registered)
                    </span>
                  </p>
                )}
              </div>

              {event.discordLink && (
                <a
                  href={event.discordLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80"
                >
                  Join our Discord for updates
                </a>
              )}

              <div className="mt-6">
                <h2 className="text-lg font-semibold text-gray-900">About</h2>
                <p className="mt-2 whitespace-pre-wrap text-gray-600">
                  {event.description}
                </p>
              </div>

              {event.requiresWaiver && (
                <div className="mt-6 rounded-lg bg-yellow-50 p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> This event requires signing a waiver
                    before attending.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RSVP Form */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 rounded-lg bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">
                {isPast ? "Event Ended" : "RSVP"}
              </h2>

              {isPast ? (
                <p className="mt-4 text-gray-600">
                  This event has already taken place.
                </p>
              ) : actionData && actionData.success ? (
                <div className="mt-4 rounded-lg bg-green-50 p-4">
                  <p className="font-medium text-green-800">
                    {actionData.message}
                  </p>
                  {!actionData.isWaitlist && (
                    <p className="mt-2 text-sm text-green-700">
                      Check your email for confirmation details.
                    </p>
                  )}
                </div>
              ) : (
                <Form method="post" className="mt-4 space-y-4">
                  {actionData && !actionData.success && actionData.errors.form && (
                    <div className="rounded-lg bg-red-50 p-3">
                      <p className="text-sm text-red-700">
                        {actionData.errors.form}
                      </p>
                    </div>
                  )}

                  {/* Sign in prompt for guests */}
                  {!isSignedIn && (
                    <div className="rounded-lg bg-primary/10 p-3">
                      <p className="text-sm text-primary">
                        <SignInButton mode="modal">
                          <button type="button" className="font-medium underline hover:text-primary/80">
                            Sign in
                          </button>
                        </SignInButton>
                        {" "}for faster checkout and to track your RSVPs
                      </p>
                    </div>
                  )}

                  {/* Signed in user indicator */}
                  {isSignedIn && user && (
                    <div className="rounded-lg bg-green-50 p-3">
                      <p className="text-sm text-green-700">
                        Signed in as <span className="font-medium">{user.primaryEmailAddress?.emailAddress}</span>
                      </p>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="name"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      defaultValue={defaultName}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      aria-describedby={
                        actionData && !actionData.success && actionData.errors.name ? "name-error" : undefined
                      }
                    />
                    {actionData && !actionData.success && actionData.errors.name && (
                      <p id="name-error" className="mt-1 text-sm text-red-600">
                        {actionData.errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Email *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      defaultValue={defaultEmail}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      aria-describedby={
                        actionData && !actionData.success && actionData.errors.email ? "email-error" : undefined
                      }
                    />
                    {actionData && !actionData.success && actionData.errors.email && (
                      <p id="email-error" className="mt-1 text-sm text-red-600">
                        {actionData.errors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="notes"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Notes (optional)
                    </label>
                    <textarea
                      id="notes"
                      name="notes"
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Any dietary restrictions, questions, etc."
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
                  >
                    {isAtCapacity ? "Join Waitlist" : "RSVP Now"}
                  </button>

                  {isAtCapacity && (
                    <p className="text-center text-sm text-gray-500">
                      Event is at capacity. You'll be added to the waitlist.
                    </p>
                  )}
                </Form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
