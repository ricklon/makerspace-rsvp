import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { Outlet, Link, useLocation, useLoaderData, useActionData, Form } from "@remix-run/react";
import { getAuth } from "@clerk/remix/ssr.server";
import { redirect, json } from "@remix-run/cloudflare";
import { UserButton, useUser } from "@clerk/remix";
import { eq } from "drizzle-orm";
import { getDb } from "~/lib/db.server";
import { adminRequests } from "~/lib/schema";

type AdminRole = "admin" | "super_admin";

interface PublicMetadata {
  role?: AdminRole;
}

export async function loader(args: LoaderFunctionArgs) {
  const { userId, sessionClaims } = await getAuth(args);
  const { context } = args;
  const db = getDb(context?.cloudflare?.env.DB);

  if (!userId) {
    return redirect("/sign-in?redirect_url=/admin");
  }

  // Check for admin role in public metadata
  const publicMetadata = (sessionClaims?.publicMetadata || {}) as PublicMetadata;
  const isAdmin = publicMetadata.role === "admin" || publicMetadata.role === "super_admin";
  const isSuperAdmin = publicMetadata.role === "super_admin";

  // Check if user has a pending request
  let requestStatus: "none" | "pending" | "denied" = "none";
  if (!isAdmin) {
    const existingRequest = await db
      .select()
      .from(adminRequests)
      .where(eq(adminRequests.clerkUserId, userId))
      .get();

    if (existingRequest) {
      requestStatus = existingRequest.status === "pending" ? "pending" :
                      existingRequest.status === "denied" ? "denied" : "none";
    }
  }

  // Count pending requests for admin badge
  let pendingCount = 0;
  if (isAdmin) {
    const pending = await db
      .select()
      .from(adminRequests)
      .where(eq(adminRequests.status, "pending"))
      .all();
    pendingCount = pending.length;
  }

  return json({ userId, isAdmin, isSuperAdmin, requestStatus, pendingCount });
}

export async function action(args: ActionFunctionArgs) {
  const { request, context } = args;
  const { userId } = await getAuth(args);
  const db = getDb(context?.cloudflare?.env.DB);

  if (!userId) {
    return redirect("/sign-in?redirect_url=/admin");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "request-access") {
    const email = formData.get("email") as string;
    const name = formData.get("name") as string;
    const reason = formData.get("reason") as string;

    // Check for existing request
    const existing = await db
      .select()
      .from(adminRequests)
      .where(eq(adminRequests.clerkUserId, userId))
      .get();

    if (existing) {
      return json({ success: false, error: "You already have a pending request" });
    }

    // Create new request
    await db.insert(adminRequests).values({
      clerkUserId: userId,
      email,
      name,
      reason: reason || null,
    }).run();

    return json({ success: true, message: "Request submitted successfully" });
  }

  return json({ success: false, error: "Invalid action" });
}

function RequestAccessForm() {
  const { user } = useUser();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🔐</div>
          <h1 className="text-2xl font-bold text-gray-900">Request Admin Access</h1>
          <p className="mt-2 text-gray-600">
            Submit a request to become an administrator
          </p>
        </div>

        {actionData?.success ? (
          <div className="rounded-lg bg-green-50 p-4 text-center">
            <p className="text-green-800 font-medium">Request submitted!</p>
            <p className="mt-2 text-sm text-green-700">
              An administrator will review your request.
            </p>
            <Link
              to="/"
              className="mt-4 inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Return to Home
            </Link>
          </div>
        ) : (
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="request-access" />
            <input type="hidden" name="email" value={user?.primaryEmailAddress?.emailAddress || ""} />
            <input type="hidden" name="name" value={user?.fullName || user?.firstName || ""} />

            {actionData && !actionData.success && "error" in actionData && (
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-sm text-red-700">{actionData.error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <p className="mt-1 text-gray-900">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <p className="mt-1 text-gray-900">{user?.fullName || user?.firstName}</p>
            </div>

            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
                Why do you need admin access? (optional)
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="I'm a board member and need to manage events..."
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium hover:bg-primary/90"
              >
                Submit Request
              </button>
              <Link
                to="/"
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>
          </Form>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200 flex justify-center">
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </div>
  );
}

function PendingRequest() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Request Pending</h1>
        <p className="text-gray-600 mb-6">
          Your admin access request is being reviewed. You'll be notified when it's approved.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            to="/"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Go to Homepage
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </div>
  );
}

function DeniedRequest() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md text-center">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Request Denied</h1>
        <p className="text-gray-600 mb-6">
          Your admin access request was not approved. Please contact an administrator if you believe this is an error.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            to="/"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Go to Homepage
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { isAdmin, isSuperAdmin, requestStatus, pendingCount } = useLoaderData<typeof loader>();
  const location = useLocation();

  // Show appropriate screen based on status
  if (!isAdmin) {
    if (requestStatus === "pending") {
      return <PendingRequest />;
    }
    if (requestStatus === "denied") {
      return <DeniedRequest />;
    }
    return <RequestAccessForm />;
  }

  const navItems = [
    { path: "/admin", label: "Dashboard", exact: true },
    { path: "/admin/events", label: "Events" },
    { path: "/admin/series", label: "Recurring Events" },
    { path: "/admin/requests", label: "Access Requests", badge: pendingCount > 0 ? pendingCount : undefined },
  ];

  const isActive = (path: string, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Admin Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <Link to="/admin" className="text-xl font-bold text-gray-900">
                Admin Panel
              </Link>
              <nav className="ml-10 flex space-x-4">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`rounded-md px-3 py-2 text-sm font-medium relative ${
                      isActive(item.path, item.exact)
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    {item.label}
                    {item.badge && (
                      <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                View Site
              </Link>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet context={{ isSuperAdmin }} />
      </main>
    </div>
  );
}
