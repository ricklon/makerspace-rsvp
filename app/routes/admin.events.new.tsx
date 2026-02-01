import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, Form, Link } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/lib/db.server";
import { events } from "~/lib/schema";

type ActionData = {
  success: false;
  errors: Record<string, string>;
} | null;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context?.cloudflare?.env?.DB);
  const formData = await request.formData();

  const name = formData.get("name") as string;
  const date = formData.get("date") as string;
  const timeStart = formData.get("timeStart") as string;
  const timeEnd = formData.get("timeEnd") as string | null;
  const location = formData.get("location") as string;
  const description = formData.get("description") as string;
  const capacityStr = formData.get("capacity") as string;
  const requiresWaiver = formData.get("requiresWaiver") === "on";
  const waiverText = formData.get("waiverText") as string | null;
  const discordLink = formData.get("discordLink") as string | null;
  const status = formData.get("status") as "draft" | "published";

  // Validate required fields
  const errors: Record<string, string> = {};

  if (!name?.trim()) errors.name = "Name is required";
  if (!date) errors.date = "Date is required";
  if (!timeStart) errors.timeStart = "Start time is required";
  if (!location?.trim()) errors.location = "Location is required";
  if (!description?.trim()) errors.description = "Description is required";

  if (Object.keys(errors).length > 0) {
    return json<ActionData>({ success: false, errors }, { status: 400 });
  }

  // Generate slug
  let slug = slugify(name);

  // Check for existing slug and make unique if needed
  const existing = await db
    .select()
    .from(events)
    .where(eq(events.slug, slug))
    .get();

  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  // Create event
  await db
    .insert(events)
    .values({
      name: name.trim(),
      slug,
      date,
      timeStart,
      timeEnd: timeEnd?.trim() || null,
      location: location.trim(),
      description: description.trim(),
      capacity: capacityStr ? parseInt(capacityStr, 10) : null,
      requiresWaiver,
      waiverText: waiverText?.trim() || null,
      discordLink: discordLink?.trim() || null,
      status,
    })
    .run();

  return redirect("/admin/events");
}

export default function NewEvent() {
  const actionData = useActionData<ActionData>();

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/admin/events"
          className="text-sm text-primary hover:text-primary/80"
        >
          &larr; Back to Events
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Create Event</h1>

      <Form method="post" className="mt-6 max-w-2xl space-y-6">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Event Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Robot Combat Championship"
          />
          {actionData?.errors?.name && (
            <p className="mt-1 text-sm text-red-600">{actionData.errors.name}</p>
          )}
        </div>

        {/* Date and Time */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700">
              Date *
            </label>
            <input
              type="date"
              id="date"
              name="date"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {actionData?.errors?.date && (
              <p className="mt-1 text-sm text-red-600">{actionData.errors.date}</p>
            )}
          </div>
          <div>
            <label htmlFor="timeStart" className="block text-sm font-medium text-gray-700">
              Start Time *
            </label>
            <input
              type="time"
              id="timeStart"
              name="timeStart"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {actionData?.errors?.timeStart && (
              <p className="mt-1 text-sm text-red-600">{actionData.errors.timeStart}</p>
            )}
          </div>
          <div>
            <label htmlFor="timeEnd" className="block text-sm font-medium text-gray-700">
              End Time
            </label>
            <input
              type="time"
              id="timeEnd"
              name="timeEnd"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Location */}
        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-700">
            Location *
          </label>
          <input
            type="text"
            id="location"
            name="location"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Fubar Labs, 303 3rd Ave, New Brunswick, NJ"
          />
          {actionData?.errors?.location && (
            <p className="mt-1 text-sm text-red-600">{actionData.errors.location}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description *
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Tell attendees what to expect..."
          />
          {actionData?.errors?.description && (
            <p className="mt-1 text-sm text-red-600">{actionData.errors.description}</p>
          )}
        </div>

        {/* Capacity */}
        <div>
          <label htmlFor="capacity" className="block text-sm font-medium text-gray-700">
            Capacity (leave blank for unlimited)
          </label>
          <input
            type="number"
            id="capacity"
            name="capacity"
            min="1"
            className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="50"
          />
        </div>

        {/* Waiver */}
        <div className="space-y-4 rounded-lg border border-gray-200 p-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              name="requiresWaiver"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="ml-2 text-sm font-medium text-gray-700">
              Requires waiver signature
            </span>
          </label>
          <div>
            <label htmlFor="waiverText" className="block text-sm font-medium text-gray-700">
              Additional Waiver Terms (optional)
            </label>
            <textarea
              id="waiverText"
              name="waiverText"
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Event-specific terms beyond the default waiver..."
            />
            <p className="mt-1 text-xs text-gray-500">
              Standard waiver items (liability, safety, etc.) are included automatically.
            </p>
          </div>
        </div>

        {/* Discord */}
        <div>
          <label htmlFor="discordLink" className="block text-sm font-medium text-gray-700">
            Discord Invite Link (optional)
          </label>
          <input
            type="url"
            id="discordLink"
            name="discordLink"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="https://discord.gg/..."
          />
        </div>

        {/* Status */}
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            id="status"
            name="status"
            className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Only published events are visible to attendees.
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            className="rounded-md bg-primary px-6 py-2 text-primary-foreground font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Create Event
          </button>
          <Link
            to="/admin/events"
            className="rounded-md border border-gray-300 px-6 py-2 text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </Form>
    </div>
  );
}
