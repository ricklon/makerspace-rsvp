import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useActionData, Form, Link } from "@remix-run/react";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "~/lib/db.server";
import { events, attendees, rsvps, attendance, waivers } from "~/lib/schema";
import { getAuth } from "@clerk/remix/ssr.server";
import { getClerkUser, getClerkUserPrimaryEmail } from "~/lib/clerk.server";
import { SignInButton, SignUpButton, useUser } from "@clerk/remix";
import { formatDate, formatTimeRangeWithTimezone } from "~/utils/date";
import { UserMenu } from "~/components/UserMenu";

export const meta: MetaFunction = () => {
  return [
    { title: "My RSVPs - FUBAR Labs" },
    { name: "description", content: "View and manage your event RSVPs" },
  ];
};

type RsvpWithEvent = {
  rsvp: {
    id: string;
    status: string;
    confirmationToken: string | null;
    createdAt: string;
  };
  event: {
    id: string;
    name: string;
    slug: string;
    date: string;
    timeStart: string;
    timeEnd: string | null;
    location: string;
    status: string;
    requiresWaiver: boolean;
  };
  checkedIn: boolean;
  waiverSigned: boolean;
};

type LoaderData = {
  isSignedIn: boolean;
  rsvpList: RsvpWithEvent[];
  lookupEmail?: string;
  attendeeName?: string;
  userFirstName?: string;
  accountLinked?: boolean;
};

type ActionData = {
  success: boolean;
  rsvpList?: RsvpWithEvent[];
  lookupEmail?: string;
  attendeeName?: string;
  error?: string;
};

export async function loader(args: LoaderFunctionArgs) {
  const { context } = args;
  const db = getDb(context?.cloudflare?.env.DB);

  const { userId } = await getAuth(args);

  if (!userId) {
    return json<LoaderData>({
      isSignedIn: false,
      rsvpList: [],
    });
  }

  // Find attendee by Clerk user ID
  let attendee = await db
    .select()
    .from(attendees)
    .where(eq(attendees.clerkUserId, userId))
    .get();

  let accountLinked = false;
  let userFirstName: string | undefined;

  // If no attendee found by clerkUserId, try to auto-link by email
  if (!attendee) {
    try {
      // Get Clerk user to find their email
      const clerkSecretKey = context?.cloudflare?.env?.CLERK_SECRET_KEY as string;
      if (clerkSecretKey) {
        const clerkUser = await getClerkUser(clerkSecretKey, userId);
        if (clerkUser) {
          const clerkEmail = getClerkUserPrimaryEmail(clerkUser)?.toLowerCase();
          userFirstName = clerkUser.first_name || undefined;

          if (clerkEmail) {
            // Look up attendee by email
            const existingAttendee = await db
              .select()
              .from(attendees)
              .where(eq(attendees.email, clerkEmail))
              .get();

            if (existingAttendee) {
              // Link the attendee to the Clerk user
              await db
                .update(attendees)
                .set({ clerkUserId: userId })
                .where(eq(attendees.id, existingAttendee.id))
                .run();

              attendee = { ...existingAttendee, clerkUserId: userId };
              accountLinked = true;
            }
          }
        }
      }
    } catch (error) {
      // If we can't get Clerk user info, just continue with no attendee
      console.error("[my-rsvps] Failed to get Clerk user for auto-link:", error);
    }
  }

  if (!attendee) {
    return json<LoaderData>({
      isSignedIn: true,
      rsvpList: [],
      userFirstName,
    });
  }

  // Get all RSVPs for this attendee
  const rsvpList = await getRsvpsForAttendee(db, attendee.id);

  return json<LoaderData>({
    isSignedIn: true,
    rsvpList,
    attendeeName: attendee.name,
    userFirstName,
    accountLinked,
  });
}

export async function action(args: ActionFunctionArgs) {
  const { request, context } = args;
  const db = getDb(context?.cloudflare?.env.DB);

  const formData = await request.formData();
  const email = formData.get("email")?.toString().toLowerCase().trim();

  if (!email) {
    return json<ActionData>({
      success: false,
      error: "Please enter an email address",
    });
  }

  // Find attendee by email
  const attendee = await db
    .select()
    .from(attendees)
    .where(eq(attendees.email, email))
    .get();

  if (!attendee) {
    return json<ActionData>({
      success: false,
      error: "No RSVPs found for this email address",
      lookupEmail: email,
    });
  }

  // Get all RSVPs for this attendee
  const rsvpList = await getRsvpsForAttendee(db, attendee.id);

  return json<ActionData>({
    success: true,
    rsvpList,
    lookupEmail: email,
    attendeeName: attendee.name,
  });
}

async function getRsvpsForAttendee(
  db: ReturnType<typeof getDb>,
  attendeeId: string
): Promise<RsvpWithEvent[]> {
  const rsvpResults = await db
    .select({
      rsvp: {
        id: rsvps.id,
        status: rsvps.status,
        confirmationToken: rsvps.confirmationToken,
        createdAt: rsvps.createdAt,
      },
      event: {
        id: events.id,
        name: events.name,
        slug: events.slug,
        date: events.date,
        timeStart: events.timeStart,
        timeEnd: events.timeEnd,
        location: events.location,
        status: events.status,
        requiresWaiver: events.requiresWaiver,
      },
    })
    .from(rsvps)
    .innerJoin(events, eq(rsvps.eventId, events.id))
    .where(eq(rsvps.attendeeId, attendeeId))
    .orderBy(desc(events.date))
    .all();

  // Check attendance and waiver status for each RSVP
  const rsvpListWithStatus: RsvpWithEvent[] = [];
  for (const result of rsvpResults) {
    const [attendanceRecord, waiverRecord] = await Promise.all([
      db
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.eventId, result.event.id),
            eq(attendance.attendeeId, attendeeId)
          )
        )
        .get(),
      db
        .select()
        .from(waivers)
        .where(
          and(
            eq(waivers.eventId, result.event.id),
            eq(waivers.attendeeId, attendeeId)
          )
        )
        .get(),
    ]);

    rsvpListWithStatus.push({
      ...result,
      checkedIn: !!attendanceRecord,
      waiverSigned: !!waiverRecord,
    });
  }

  return rsvpListWithStatus;
}

export default function MyRsvps() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { user } = useUser();

  const isSignedIn = loaderData.isSignedIn;
  const rsvpList = actionData?.rsvpList || loaderData.rsvpList;
  const attendeeName = actionData?.attendeeName || loaderData.attendeeName;
  const lookupEmail = actionData?.lookupEmail || loaderData.lookupEmail;

  // Calculate stats
  const now = new Date().toISOString().split("T")[0];
  const upcomingRsvps = rsvpList.filter((r) => r.event.date >= now);
  const pastRsvps = rsvpList.filter((r) => r.event.date < now);
  const eventsAttended = pastRsvps.filter((r) => r.checkedIn).length;

  const displayName = user?.firstName || loaderData.userFirstName || attendeeName || "there";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-sm text-primary hover:text-primary/80">
              &larr; Back to Events
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Signed in user dashboard */}
        {isSignedIn && (
          <div>
            {/* Welcome section */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome back, {displayName}!
              </h1>
              <p className="mt-2 text-gray-600">
                Manage your event registrations and check-in history
              </p>
            </div>

            {/* Account linked notification */}
            {loaderData.accountLinked && (
              <div className="mb-6 rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="flex items-start gap-3">
                  <svg className="h-5 w-5 text-green-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Account linked successfully!
                    </p>
                    <p className="text-sm text-green-700">
                      We found your previous RSVPs and linked them to your account.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Stats cards */}
            {rsvpList.length > 0 && (
              <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-2xl font-bold text-primary">{upcomingRsvps.length}</p>
                  <p className="text-sm text-gray-600">Upcoming Events</p>
                </div>
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-2xl font-bold text-gray-900">{eventsAttended}</p>
                  <p className="text-sm text-gray-600">Events Attended</p>
                </div>
                <div className="rounded-lg bg-white p-4 shadow-sm col-span-2 sm:col-span-1">
                  <p className="text-2xl font-bold text-gray-900">{rsvpList.length}</p>
                  <p className="text-sm text-gray-600">Total RSVPs</p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {rsvpList.length === 0 ? (
              <div className="rounded-lg bg-white p-12 text-center shadow-sm">
                <div className="mx-auto h-12 w-12 text-gray-400">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">No RSVPs yet</h3>
                <p className="mt-2 text-gray-600">
                  You haven't RSVP'd to any events yet. Browse our upcoming events to get started!
                </p>
                <Link
                  to="/"
                  className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Browse Events
                </Link>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Upcoming Events */}
                {upcomingRsvps.length > 0 && (
                  <section>
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">
                      Upcoming Events
                    </h2>
                    <div className="space-y-4">
                      {upcomingRsvps.map((item) => (
                        <RsvpCard key={item.rsvp.id} item={item} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Past Events */}
                {pastRsvps.length > 0 && (
                  <section>
                    <h2 className="text-xl font-semibold text-gray-500 mb-4">
                      Past Events
                    </h2>
                    <div className="space-y-4">
                      {pastRsvps.map((item) => (
                        <RsvpCard key={item.rsvp.id} item={item} isPast />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {/* Guest view */}
        {!isSignedIn && (
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My RSVPs</h1>
            <p className="mt-2 text-gray-600">
              View your event registrations and check-in status
            </p>

            {/* Sign in/up prompt */}
            <div className="mt-8 rounded-lg bg-white p-6 shadow-sm">
              <div className="text-center">
                <div className="mx-auto h-12 w-12 text-primary">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="mt-4 text-lg font-semibold text-gray-900">
                  Sign in to see all your RSVPs
                </h2>
                <p className="mt-2 text-gray-600">
                  Create an account or sign in to automatically track your event history, view check-in status, and RSVP faster.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <SignInButton mode="modal">
                    <button className="w-full sm:w-auto rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                      Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="w-full sm:w-auto rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      Create Account
                    </button>
                  </SignUpButton>
                </div>
              </div>
            </div>

            {/* Email lookup fallback */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-gray-50 px-2 text-gray-500">Or look up by email</span>
                </div>
              </div>

              <div className="mt-6 rounded-lg bg-white p-6 shadow-sm">
                <Form method="post" className="space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      defaultValue={lookupEmail}
                      placeholder="Enter the email you used to RSVP"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    Look Up My RSVPs
                  </button>
                </Form>
              </div>
            </div>

            {/* Error message */}
            {actionData?.success === false && actionData.error && (
              <div className="mt-6 rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="text-red-700">{actionData.error}</p>
              </div>
            )}

            {/* Results from email lookup */}
            {actionData?.success && rsvpList.length > 0 && (
              <div className="mt-8">
                <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-4">
                  <p className="text-sm text-blue-800">
                    Showing RSVPs for <span className="font-medium">{attendeeName}</span> ({lookupEmail})
                  </p>
                  <p className="mt-1 text-sm text-blue-700">
                    <SignInButton mode="modal">
                      <button className="font-medium underline hover:text-blue-800">
                        Sign in
                      </button>
                    </SignInButton>
                    {" "}to link these RSVPs to your account and see them automatically.
                  </p>
                </div>
                <div className="space-y-8">
                  {upcomingRsvps.length > 0 && (
                    <section>
                      <h2 className="text-xl font-semibold text-gray-900 mb-4">
                        Upcoming Events
                      </h2>
                      <div className="space-y-4">
                        {upcomingRsvps.map((item) => (
                          <RsvpCard key={item.rsvp.id} item={item} />
                        ))}
                      </div>
                    </section>
                  )}
                  {pastRsvps.length > 0 && (
                    <section>
                      <h2 className="text-xl font-semibold text-gray-500 mb-4">
                        Past Events
                      </h2>
                      <div className="space-y-4">
                        {pastRsvps.map((item) => (
                          <RsvpCard key={item.rsvp.id} item={item} isPast />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function RsvpCard({ item, isPast }: { item: RsvpWithEvent; isPast?: boolean }) {
  const statusColors: Record<string, string> = {
    yes: "bg-green-100 text-green-800",
    waitlist: "bg-yellow-100 text-yellow-800",
    maybe: "bg-gray-100 text-gray-800",
    no: "bg-red-100 text-red-800",
    cancelled: "bg-red-100 text-red-800",
  };

  const statusLabels: Record<string, string> = {
    yes: "Confirmed",
    waitlist: "Waitlist",
    maybe: "Maybe",
    no: "Not Going",
    cancelled: "Cancelled",
  };

  const showWaiverBadge = item.event.requiresWaiver && !isPast;
  const needsWaiver = showWaiverBadge && !item.waiverSigned;

  return (
    <div className={`rounded-lg bg-white p-4 shadow-sm ${isPast ? "opacity-75" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            to={`/events/${item.event.slug}`}
            className="text-lg font-medium text-gray-900 hover:text-primary"
          >
            {item.event.name}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDate(item.event.date)}
            </span>
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatTimeRangeWithTimezone(item.event.timeStart, item.event.timeEnd)}
            </span>
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {item.event.location}
            </span>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
              statusColors[item.rsvp.status] || "bg-gray-100 text-gray-800"
            }`}
          >
            {statusLabels[item.rsvp.status] || item.rsvp.status}
          </span>

          {/* Attendance status for past events */}
          {isPast && (
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                item.checkedIn
                  ? "bg-primary/20 text-primary"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {item.checkedIn ? "Attended" : "No-show"}
            </span>
          )}

          {/* Waiver status for upcoming events */}
          {showWaiverBadge && (
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                item.waiverSigned
                  ? "bg-green-100 text-green-800"
                  : "bg-orange-100 text-orange-800"
              }`}
            >
              {item.waiverSigned ? "Waiver Signed" : "Waiver Required"}
            </span>
          )}
        </div>
      </div>

      {/* Action links */}
      {!isPast && (
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-4">
          {item.rsvp.confirmationToken && (
            <Link
              to={`/events/${item.event.slug}/confirmation?token=${item.rsvp.confirmationToken}`}
              className="text-sm text-primary hover:text-primary/80"
            >
              View confirmation &amp; QR code &rarr;
            </Link>
          )}
          {needsWaiver && item.rsvp.confirmationToken && (
            <Link
              to={`/events/${item.event.slug}/waiver?token=${item.rsvp.confirmationToken}`}
              className="text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Sign waiver &rarr;
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
