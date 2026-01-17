import { useEffect, useRef, useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import { eq, and } from "drizzle-orm";
import { Html5Qrcode } from "html5-qrcode";
import { getDb } from "~/lib/db.server";
import { events, rsvps, attendees, attendance } from "~/lib/schema";

type CheckinResult = {
  success: true;
  attendeeName: string;
  alreadyCheckedIn: boolean;
} | {
  success: false;
  error: string;
};

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = getDb(context?.cloudflare?.env?.DB);
  const { id } = params;

  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const event = await db.select().from(events).where(eq(events.id, id)).get();

  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  // Get check-in stats
  const attendanceList = await db
    .select()
    .from(attendance)
    .where(eq(attendance.eventId, id))
    .all();

  const rsvpList = await db
    .select()
    .from(rsvps)
    .where(and(eq(rsvps.eventId, id), eq(rsvps.status, "yes")))
    .all();

  return json({
    event: { id: event.id, name: event.name, slug: event.slug },
    stats: {
      checkedIn: attendanceList.length,
      totalRsvps: rsvpList.length,
    },
  });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context?.cloudflare?.env?.DB);
  const { id } = params;
  const formData = await request.formData();
  const token = formData.get("token") as string;

  if (!id || !token) {
    return json<CheckinResult>({ success: false, error: "Invalid request" });
  }

  // Find RSVP by check-in token
  const rsvp = await db
    .select()
    .from(rsvps)
    .where(eq(rsvps.checkinToken, token))
    .get();

  if (!rsvp) {
    return json<CheckinResult>({ success: false, error: "Invalid QR code - RSVP not found" });
  }

  if (rsvp.eventId !== id) {
    return json<CheckinResult>({ success: false, error: "QR code is for a different event" });
  }

  // Get attendee name
  const attendee = await db
    .select()
    .from(attendees)
    .where(eq(attendees.id, rsvp.attendeeId))
    .get();

  if (!attendee) {
    return json<CheckinResult>({ success: false, error: "Attendee not found" });
  }

  // Check if already checked in
  const existing = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.eventId, id), eq(attendance.attendeeId, attendee.id)))
    .get();

  if (existing) {
    return json<CheckinResult>({
      success: true,
      attendeeName: attendee.name,
      alreadyCheckedIn: true,
    });
  }

  // Create attendance record
  await db
    .insert(attendance)
    .values({
      eventId: id,
      attendeeId: attendee.id,
      checkInMethod: "qr_code",
    })
    .run();

  return json<CheckinResult>({
    success: true,
    attendeeName: attendee.name,
    alreadyCheckedIn: false,
  });
}

export default function AdminScanPage() {
  const { event, stats } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<CheckinResult>();
  const [scannerReady, setScannerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CheckinResult | null>(null);
  const [checkedInCount, setCheckedInCount] = useState(stats.checkedIn);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  const processQrCode = useCallback((decodedText: string) => {
    // Prevent duplicate scans
    if (lastScannedRef.current === decodedText) return;
    lastScannedRef.current = decodedText;

    // Reset after 3 seconds to allow re-scanning same code
    setTimeout(() => {
      lastScannedRef.current = null;
    }, 3000);

    // Extract token from URL
    // Expected format: https://example.com/events/slug/checkin?token=xxx
    try {
      const url = new URL(decodedText);
      const token = url.searchParams.get("token");

      if (!token) {
        setLastResult({ success: false, error: "Invalid QR code - no token found" });
        return;
      }

      // Submit check-in
      fetcher.submit(
        { token },
        { method: "post" }
      );
    } catch {
      setLastResult({ success: false, error: "Invalid QR code format" });
    }
  }, [fetcher]);

  useEffect(() => {
    if (fetcher.data) {
      setLastResult(fetcher.data);
      if (fetcher.data.success && !fetcher.data.alreadyCheckedIn) {
        setCheckedInCount((c) => c + 1);
      }
    }
  }, [fetcher.data]);

  useEffect(() => {
    // Prevent double initialization in StrictMode
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Small delay to ensure DOM element exists
    const timeoutId = setTimeout(() => {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          processQrCode,
          () => {} // Ignore errors during scanning
        )
        .then(() => {
          setScannerReady(true);
        })
        .catch((err) => {
          setError(`Camera error: ${err.message || "Could not access camera"}`);
        });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      mountedRef.current = false;
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [processQrCode]);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 shadow-sm">
        <div className="mx-auto max-w-lg px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              to={`/admin/events/${event.id}`}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              &larr; Back to Event
            </Link>
            <div className="text-right">
              <p className="text-xs text-gray-400">Checked In</p>
              <p className="text-lg font-bold text-white">
                {checkedInCount} / {stats.totalRsvps}
              </p>
            </div>
          </div>
          <h1 className="mt-2 text-lg font-semibold text-white truncate">
            {event.name}
          </h1>
        </div>
      </header>

      {/* Scanner */}
      <main className="mx-auto max-w-lg px-4 py-6">
        {error ? (
          <div className="rounded-lg bg-red-900/50 p-6 text-center">
            <p className="text-red-300">{error}</p>
            <p className="mt-2 text-sm text-gray-400">
              Make sure you've granted camera permissions.
            </p>
          </div>
        ) : (
          <>
            <div
              id="qr-reader"
              className="overflow-hidden rounded-lg bg-black"
              style={{ minHeight: "300px" }}
            />

            {!scannerReady && (
              <div className="mt-4 text-center">
                <p className="text-gray-400">Starting camera...</p>
              </div>
            )}
          </>
        )}

        {/* Result Display */}
        {lastResult && (
          <div
            className={`mt-6 rounded-lg p-6 text-center ${
              lastResult.success
                ? lastResult.alreadyCheckedIn
                  ? "bg-yellow-900/50"
                  : "bg-green-900/50"
                : "bg-red-900/50"
            }`}
          >
            {lastResult.success ? (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                  <svg
                    className="h-8 w-8 text-green-400"
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
                <p className="mt-4 text-xl font-semibold text-white">
                  {lastResult.attendeeName}
                </p>
                <p className={`mt-1 text-sm ${
                  lastResult.alreadyCheckedIn ? "text-yellow-300" : "text-green-300"
                }`}>
                  {lastResult.alreadyCheckedIn
                    ? "Already checked in"
                    : "Checked in successfully!"}
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
                  <svg
                    className="h-8 w-8 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <p className="mt-4 text-red-300">{lastResult.error}</p>
              </>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6 text-center text-sm text-gray-400">
          <p>Point the camera at an attendee's QR code</p>
        </div>
      </main>
    </div>
  );
}
