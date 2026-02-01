import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useActionData, Form, Link } from "@remix-run/react";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/lib/db.server";
import { events, attendees, rsvps, waivers } from "~/lib/schema";
import {
  getWaiverConfigForEvent,
  validateWaiverConsents,
  type WaiverItem,
} from "~/lib/waiver-config";
import { sendEmail, buildRsvpConfirmationEmail } from "~/lib/email.server";
import { formatDate, formatTimeRange } from "~/utils/date";

type ActionData =
  | { success: true }
  | { success: false; errors: { form?: string; items?: string[] } };

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.event) {
    return [{ title: "Waiver Not Found" }];
  }
  return [
    { title: `Sign Waiver - ${data.event.name}` },
    { name: "description", content: `Sign the participation waiver for ${data.event.name}` },
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
    // Redirect back to event page if no token provided
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

  if (!event.requiresWaiver) {
    // Event doesn't require waiver, redirect to confirmation
    return redirect(`/events/${slug}/confirmation?token=${token}`);
  }

  // Look up RSVP by token
  const rsvp = await db
    .select()
    .from(rsvps)
    .where(eq(rsvps.confirmationToken, token))
    .get();

  if (!rsvp || rsvp.eventId !== event.id) {
    // Invalid token or wrong event
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

  // Check if waiver already signed
  const existingWaiver = await db
    .select()
    .from(waivers)
    .where(and(eq(waivers.eventId, event.id), eq(waivers.attendeeId, attendee.id)))
    .get();

  if (existingWaiver) {
    // Already signed, redirect to confirmation
    return redirect(`/events/${slug}/confirmation?token=${token}`);
  }

  // Get waiver config for this event
  const waiverConfig = getWaiverConfigForEvent(undefined, event.waiverText);

  return json({
    event,
    attendee: { name: attendee.name, email: attendee.email },
    token,
    waiverConfig,
  });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context?.cloudflare?.env.DB);
  const { slug } = params;

  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  const formData = await request.formData();
  const token = formData.get("token") as string;

  if (!token) {
    return json<ActionData>(
      { success: false, errors: { form: "Invalid request" } },
      { status: 400 }
    );
  }

  // Get the event
  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eq(events.status, "published")))
    .get();

  if (!event || !event.requiresWaiver) {
    throw new Response("Event not found", { status: 404 });
  }

  // Look up RSVP by token
  const rsvp = await db
    .select()
    .from(rsvps)
    .where(eq(rsvps.confirmationToken, token))
    .get();

  if (!rsvp || rsvp.eventId !== event.id) {
    return json<ActionData>(
      { success: false, errors: { form: "Invalid or expired link. Please RSVP again." } },
      { status: 400 }
    );
  }

  // Get attendee
  const attendee = await db
    .select()
    .from(attendees)
    .where(eq(attendees.id, rsvp.attendeeId))
    .get();

  if (!attendee) {
    return json<ActionData>(
      { success: false, errors: { form: "Attendee not found. Please RSVP first." } },
      { status: 400 }
    );
  }

  // Get waiver config and parse consents from form
  const waiverConfig = getWaiverConfigForEvent(undefined, event.waiverText);
  const consents: Record<string, boolean> = {};

  for (const item of waiverConfig.items) {
    const value = formData.get(`consent_${item.id}`);
    consents[item.id] = value === "on" || value === "true";
  }

  // Validate required items
  const validation = validateWaiverConsents(consents, waiverConfig.items);

  if (!validation.valid) {
    return json<ActionData>(
      {
        success: false,
        errors: {
          form: "Please acknowledge all required items",
          items: validation.missingItems,
        },
      },
      { status: 400 }
    );
  }

  // Check final confirmation checkbox
  const finalConfirmation = formData.get("final_confirmation");
  if (finalConfirmation !== "on" && finalConfirmation !== "true") {
    return json<ActionData>(
      {
        success: false,
        errors: { form: "Please check the final confirmation box to complete signing" },
      },
      { status: 400 }
    );
  }

  // Get IP address from request headers
  const ipAddress =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0] ||
    "unknown";

  // Save waiver
  await db
    .insert(waivers)
    .values({
      eventId: event.id,
      attendeeId: attendee.id,
      waiverText: JSON.stringify(waiverConfig),
      consents: JSON.stringify(consents),
      ipAddress,
      consent: true,
    })
    .run();

  // Send confirmation email now that waiver is signed
  const baseUrl = new URL(request.url).origin;
  const confirmationUrl = `${baseUrl}/events/${slug}/confirmation?token=${token}`;

  const emailContent = buildRsvpConfirmationEmail({
    attendeeName: attendee.name,
    eventName: event.name,
    eventDate: formatDate(event.date),
    eventTime: formatTimeRange(event.timeStart, event.timeEnd),
    eventLocation: event.location,
    confirmationUrl,
    isWaitlist: rsvp.status === "waitlist",
    requiresWaiver: true,
    makerspaceName: "Fubar Labs",
  });

  const sendgridApiKey = context?.cloudflare?.env?.SENDGRID_API_KEY as string | undefined;
  const fromEmail = context?.cloudflare?.env?.FROM_EMAIL as string || "events@fubarlabs.org";

  sendEmail(
    {
      to: { email: attendee.email, name: attendee.name },
      from: { email: fromEmail, name: "Fubar Labs" },
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    },
    sendgridApiKey || ""
  ).catch((err) => console.error("[waiver] Failed to send confirmation email:", err));

  // Redirect to confirmation page
  return redirect(`/events/${slug}/confirmation?token=${token}`);
}

export default function WaiverPage() {
  const { event, attendee, token, waiverConfig } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();

  const requiredItems = waiverConfig.items.filter((item: WaiverItem) => item.required);
  const optionalItems = waiverConfig.items.filter((item: WaiverItem) => !item.required);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <Link
            to={`/events/${event.slug}`}
            className="text-sm text-primary hover:text-primary/80"
          >
            &larr; Back to Event
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">{waiverConfig.title}</h1>
          <p className="mt-2 text-sm text-gray-600">
            For: <strong>{event.name}</strong>
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Attendee: <strong>{attendee.name}</strong> ({attendee.email})
          </p>

          <div className="mt-4 rounded-lg bg-primary/10 p-4">
            <p className="text-sm text-primary">{waiverConfig.introduction}</p>
          </div>

          <Form method="post" className="mt-6 space-y-6">
            <input type="hidden" name="token" value={token} />

            {/* Error message */}
            {actionData && !actionData.success && actionData.errors.form && (
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">{actionData.errors.form}</p>
                {actionData.errors.items && actionData.errors.items.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-red-700">
                    {actionData.errors.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Required Items */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Required Acknowledgments
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                You must agree to all items below to participate
              </p>
              <div className="mt-4 space-y-4">
                {requiredItems.map((item: WaiverItem) => (
                  <WaiverCheckbox
                    key={item.id}
                    item={item}
                    hasError={
                      actionData &&
                      !actionData.success &&
                      actionData.errors.items?.includes(item.label)
                    }
                  />
                ))}
              </div>
            </div>

            {/* Optional Items */}
            {optionalItems.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Optional Preferences
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  These have sensible defaults but you can change them
                </p>
                <div className="mt-4 space-y-4">
                  {optionalItems.map((item: WaiverItem) => (
                    <WaiverCheckbox key={item.id} item={item} hasError={false} />
                  ))}
                </div>
              </div>
            )}

            {/* Final Confirmation */}
            <div className="border-t border-gray-200 pt-6">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="final_confirmation"
                  className="mt-1 h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium text-gray-900">
                  {waiverConfig.signature.label}
                </span>
              </label>
            </div>

            {/* Submit */}
            <div className="flex gap-4">
              <button
                type="submit"
                className="flex-1 rounded-md bg-primary px-4 py-3 text-primary-foreground font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                Sign Waiver & Complete Registration
              </button>
            </div>

            <p className="text-center text-xs text-gray-500">
              Your signature will be recorded with your IP address and timestamp for legal compliance.
            </p>
          </Form>
        </div>
      </main>
    </div>
  );
}

function WaiverCheckbox({
  item,
  hasError,
}: {
  item: WaiverItem;
  hasError?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        hasError ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"
      }`}
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name={`consent_${item.id}`}
          defaultChecked={item.defaultChecked}
          className="mt-1 h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <div className="flex-1">
          <span className="font-medium text-gray-900">
            {item.label}
            {item.required && <span className="ml-1 text-red-500">*</span>}
          </span>
          <p className="mt-1 text-sm text-gray-600">{item.description}</p>
        </div>
      </label>
    </div>
  );
}
