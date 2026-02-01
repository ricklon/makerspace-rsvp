import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { eq, desc } from "drizzle-orm";
import { getAuth } from "@clerk/remix/ssr.server";
import { getDb } from "~/lib/db.server";
import { adminRequests } from "~/lib/schema";
import { setUserRole } from "~/lib/clerk.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDb(context?.cloudflare?.env.DB);

  const requests = await db
    .select()
    .from(adminRequests)
    .orderBy(desc(adminRequests.createdAt))
    .all();

  // Separate by status
  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const denied = requests.filter((r) => r.status === "denied");

  return json({ pending, approved, denied });
}

export async function action(args: ActionFunctionArgs) {
  const { request, context } = args;
  const { userId } = await getAuth(args);
  const db = getDb(context?.cloudflare?.env.DB);

  if (!userId) {
    return json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const requestId = formData.get("requestId") as string;

  if (!requestId) {
    return json({ success: false, error: "Request ID required" }, { status: 400 });
  }

  // Get the request
  const adminRequest = await db
    .select()
    .from(adminRequests)
    .where(eq(adminRequests.id, requestId))
    .get();

  if (!adminRequest) {
    return json({ success: false, error: "Request not found" }, { status: 404 });
  }

  if (intent === "approve") {
    // Update Clerk user metadata to add admin role
    const clerkSecretKey = context?.cloudflare?.env?.CLERK_SECRET_KEY as string;

    if (!clerkSecretKey) {
      return json({ success: false, error: "Clerk secret key not configured" }, { status: 500 });
    }

    const result = await setUserRole(clerkSecretKey, adminRequest.clerkUserId, "admin");

    if (!result.success) {
      return json({ success: false, error: result.error || "Failed to update user role" }, { status: 500 });
    }

    // Update request status
    await db
      .update(adminRequests)
      .set({
        status: "approved",
        reviewedBy: userId,
        reviewedAt: new Date().toISOString(),
      })
      .where(eq(adminRequests.id, requestId))
      .run();

    return json({ success: true, message: `Approved ${adminRequest.name} as admin` });
  }

  if (intent === "deny") {
    await db
      .update(adminRequests)
      .set({
        status: "denied",
        reviewedBy: userId,
        reviewedAt: new Date().toISOString(),
      })
      .where(eq(adminRequests.id, requestId))
      .run();

    return json({ success: true, message: `Denied request from ${adminRequest.name}` });
  }

  if (intent === "revoke") {
    // Remove admin role from user
    const clerkSecretKey = context?.cloudflare?.env?.CLERK_SECRET_KEY as string;

    if (!clerkSecretKey) {
      return json({ success: false, error: "Clerk secret key not configured" }, { status: 500 });
    }

    const result = await setUserRole(clerkSecretKey, adminRequest.clerkUserId, null);

    if (!result.success) {
      return json({ success: false, error: result.error || "Failed to revoke user role" }, { status: 500 });
    }

    // Update request status back to denied
    await db
      .update(adminRequests)
      .set({
        status: "denied",
        reviewedBy: userId,
        reviewedAt: new Date().toISOString(),
      })
      .where(eq(adminRequests.id, requestId))
      .run();

    return json({ success: true, message: `Revoked admin access for ${adminRequest.name}` });
  }

  return json({ success: false, error: "Invalid action" }, { status: 400 });
}

export default function AdminRequests() {
  const { pending, approved, denied } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Access Requests</h1>
      <p className="mt-2 text-gray-600">
        Manage admin access requests from users
      </p>

      {actionData && (
        <div
          className={`mt-4 rounded-lg p-4 ${
            actionData.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {actionData.success && "message" in actionData
            ? actionData.message
            : "error" in actionData
              ? actionData.error
              : null}
        </div>
      )}

      {/* Pending Requests */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">
          Pending Requests ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="mt-4 text-gray-500">No pending requests</p>
        ) : (
          <div className="mt-4 space-y-4">
            {pending.map((req) => (
              <div
                key={req.id}
                className="rounded-lg bg-white p-6 shadow-sm border-l-4 border-yellow-400"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{req.name}</h3>
                    <p className="text-sm text-gray-500">{req.email}</p>
                    {req.reason && (
                      <p className="mt-2 text-sm text-gray-600">
                        <span className="font-medium">Reason:</span> {req.reason}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      Requested {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Form method="post">
                      <input type="hidden" name="requestId" value={req.id} />
                      <input type="hidden" name="intent" value="approve" />
                      <button
                        type="submit"
                        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                      >
                        Approve
                      </button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="requestId" value={req.id} />
                      <input type="hidden" name="intent" value="deny" />
                      <button
                        type="submit"
                        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                      >
                        Deny
                      </button>
                    </Form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approved Admins */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">
          Approved Admins ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <p className="mt-4 text-gray-500">No approved admins yet</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Approved
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {approved.map((req) => (
                  <tr key={req.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                      {req.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {req.email}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {req.reviewedAt
                        ? new Date(req.reviewedAt).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <Form method="post" className="inline">
                        <input type="hidden" name="requestId" value={req.id} />
                        <input type="hidden" name="intent" value="revoke" />
                        <button
                          type="submit"
                          className="text-red-600 hover:text-red-900"
                          onClick={(e) => {
                            if (!confirm("Revoke admin access for this user?")) {
                              e.preventDefault();
                            }
                          }}
                        >
                          Revoke
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Denied Requests */}
      {denied.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-500">
            Denied Requests ({denied.length})
          </h2>
          <div className="mt-4 overflow-hidden rounded-lg bg-white shadow opacity-75">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Denied
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {denied.map((req) => (
                  <tr key={req.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {req.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {req.email}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {req.reviewedAt
                        ? new Date(req.reviewedAt).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
