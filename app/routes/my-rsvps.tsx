import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useActionData, Form, Link } from "@remix-run/react";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "~/lib/db.server";
import { events, attendees, rsvps, attendance } from "~/lib/schema";
import { getAuth } from "@clerk/remix/ssr.server";
import { SignInButton, useUser } from "@clerk/remix";
import { formatDate, formatTimeRange } from "~/utils/date";

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
  };
  checkedIn: boolean;
};

type LoaderData = {
  isSignedIn: boolean;
  rsvpList: RsvpWithEvent[];
  lookupEmail?: string;
  attendeeName?: string;
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
  const attendee = await db
    .select()
    .from(attendees)
    .where(eq(attendees.clerkUserId, userId))
    .get();

  if (!attendee) {
    return json<LoaderData>({
      isSignedIn: true,
      rsvpList: [],
    });
  }

  // Get all RSVPs for this attendee
  const rsvpList = await getRsvpsForAttendee(db, attendee.id);

  return json<LoaderData>({
    isSignedIn: true,
    rsvpList,
    attendeeName: attendee.name,
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
      },
    })
    .from(rsvps)
    .innerJoin(events, eq(rsvps.eventId, events.id))
    .where(eq(rsvps.attendeeId, attendeeId))
    .orderBy(desc(events.date))
    .all();

  // Check attendance for each RSVP
  const rsvpListWithAttendance: RsvpWithEvent[] = [];
  for (const result of rsvpResults) {
    const attendanceRecord = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.eventId, result.event.id),
          eq(attendance.attendeeId, attendeeId)
        )
      )
      .get();

    rsvpListWithAttendance.push({
      ...result,
      checkedIn: !!attendanceRecord,
    });
  }

  return rsvpListWithAttendance;
}

export default function MyRsvps() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { user } = useUser();

  const isSignedIn = loaderData.isSignedIn;
  const rsvpList = actionData?.rsvpList || loaderData.rsvpList;
  const attendeeName = actionData?.attendeeName || loaderData.attendeeName;
  const lookupEmail = actionData?.lookupEmail || loaderData.lookupEmail;
  const showResults = rsvpList.length > 0 || actionData?.success === false;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-sm text-blue-600 hover:text-blue-800">
              &larr; Back to Events
            </Link>
            {!isSignedIn && (
              <SignInButton mode="modal">
                <button className="text-sm font-medium text-blue-600 hover:text-blue-800">
                  Sign In
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900">My RSVPs</h1>
        <p className="mt-2 text-gray-600">
          View your event registrations and check-in status
        </p>

        {/* Signed in user - show RSVPs automatically */}
        {isSignedIn && (
          <div className="mt-6">
            {user && (
              <div className="mb-6 rounded-lg bg-green-50 p-4">
                <p className="text-sm text-green-700">
                  Signed in as{" "}
                  <span className="font-medium">
                    {user.primaryEmailAddress?.emailAddress}
                  </span>
                </p>
              </div>
            )}

            {rsvpList.length === 0 ? (
              <div className="rounded-lg bg-white p-8 text-center shadow-sm">
                <p className="text-gray-600">You haven't RSVP'd to any events yet.</p>
                <Link
                  to="/"
                  className="mt-4 inline-block text-blue-600 hover:text-blue-800"
                >
                  Browse upcoming events
                </Link>
              </div>
            ) : (
              <RsvpList rsvpList={rsvpList} attendeeName={attendeeName} />
            )}
          </div>
        )}

        {/* Guest - show email lookup form */}
        {!isSignedIn && (
          <div className="mt-6">
            <div className="mb-6 rounded-lg bg-blue-50 p-4">
              <p className="text-sm text-blue-700">
                <SignInButton mode="modal">
                  <button className="font-medium underline hover:text-blue-900">
                    Sign in
                  </button>
                </SignInButton>
                {" "}to automatically see all your RSVPs, or look up by email below.
              </p>
            </div>

            <div className="rounded-lg bg-white p-6 shadow-sm">
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
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Look Up My RSVPs
                </button>
              </Form>
            </div>

            {/* Error message */}
            {actionData?.success === false && actionData.error && (
              <div className="mt-6 rounded-lg bg-red-50 p-4">
                <p className="text-red-700">{actionData.error}</p>
              </div>
            )}

            {/* Results */}
            {showResults && rsvpList.length > 0 && (
              <div className="mt-6">
                <RsvpList rsvpList={rsvpList} attendeeName={attendeeName} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function RsvpList({
  rsvpList,
  attendeeName,
}: {
  rsvpList: RsvpWithEvent[];
  attendeeName?: string;
}) {
  const now = new Date().toISOString().split("T")[0];
  const upcomingRsvps = rsvpList.filter((r) => r.event.date >= now);
  const pastRsvps = rsvpList.filter((r) => r.event.date < now);

  return (
    <div className="space-y-8">
      {attendeeName && (
        <p className="text-lg text-gray-700">
          RSVPs for <span className="font-medium">{attendeeName}</span>
        </p>
      )}

      {upcomingRsvps.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Upcoming Events
          </h2>
          <div className="space-y-4">
            {upcomingRsvps.map((item) => (
              <RsvpCard key={item.rsvp.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {pastRsvps.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-500 mb-4">
            Past Events
          </h2>
          <div className="space-y-4 opacity-75">
            {pastRsvps.map((item) => (
              <RsvpCard key={item.rsvp.id} item={item} isPast />
            ))}
          </div>
        </div>
      )}
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

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <Link
            to={`/events/${item.event.slug}`}
            className="text-lg font-medium text-gray-900 hover:text-blue-600"
          >
            {item.event.name}
          </Link>
          <div className="mt-1 space-y-1 text-sm text-gray-600">
            <p>{formatDate(item.event.date)}</p>
            <p>{formatTimeRange(item.event.timeStart, item.event.timeEnd)}</p>
            <p>{item.event.location}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
              statusColors[item.rsvp.status] || "bg-gray-100 text-gray-800"
            }`}
          >
            {item.rsvp.status === "yes"
              ? "Confirmed"
              : item.rsvp.status.charAt(0).toUpperCase() +
                item.rsvp.status.slice(1)}
          </span>
          {item.checkedIn && (
            <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
              Checked In
            </span>
          )}
        </div>
      </div>
      {!isPast && item.rsvp.confirmationToken && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <Link
            to={`/events/${item.event.slug}/confirmation?token=${item.rsvp.confirmationToken}`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            View confirmation &amp; QR code &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
