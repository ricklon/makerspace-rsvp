import { drizzle } from "drizzle-orm/d1";
import Database from "better-sqlite3";
import { drizzle as drizzleBetterSqlite } from "drizzle-orm/better-sqlite3";
import * as schema from "../app/lib/schema";

// Create an in-memory SQLite database for testing
export function createTestDb() {
  const sqlite = new Database(":memory:");

  // Create tables
  sqlite.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      time_start TEXT NOT NULL,
      time_end TEXT,
      location TEXT NOT NULL,
      capacity INTEGER,
      requires_waiver INTEGER DEFAULT 0 NOT NULL,
      waiver_text TEXT,
      discord_link TEXT,
      status TEXT DEFAULT 'draft' NOT NULL,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP) NOT NULL
    );

    CREATE TABLE attendees (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP) NOT NULL
    );

    CREATE TABLE rsvps (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      attendee_id TEXT NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'yes' NOT NULL,
      notes TEXT,
      confirmation_token TEXT UNIQUE,
      checkin_token TEXT UNIQUE,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
      updated_at TEXT DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
      UNIQUE(event_id, attendee_id)
    );

    CREATE TABLE waivers (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      attendee_id TEXT NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
      waiver_text TEXT NOT NULL,
      consents TEXT NOT NULL,
      signed_at TEXT DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
      ip_address TEXT NOT NULL,
      consent INTEGER NOT NULL,
      UNIQUE(event_id, attendee_id)
    );

    CREATE TABLE attendance (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      attendee_id TEXT NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
      checked_in_at TEXT DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
      check_in_method TEXT DEFAULT 'manual' NOT NULL,
      UNIQUE(event_id, attendee_id)
    );
  `);

  return drizzleBetterSqlite(sqlite, { schema });
}

// Seed test data
export function seedTestEvent(db: ReturnType<typeof createTestDb>, overrides: Partial<schema.NewEvent> = {}) {
  const event: schema.NewEvent = {
    id: overrides.id || "test-event-1",
    name: overrides.name || "Test Event",
    slug: overrides.slug || "test-event",
    description: overrides.description || "A test event description",
    date: overrides.date || "2026-02-15",
    timeStart: overrides.timeStart || "10:00",
    timeEnd: overrides.timeEnd || "12:00",
    location: overrides.location || "Test Location",
    capacity: overrides.capacity ?? 50,
    requiresWaiver: overrides.requiresWaiver ?? false,
    waiverText: overrides.waiverText || null,
    discordLink: overrides.discordLink || null,
    status: overrides.status || "published",
  };

  db.insert(schema.events).values(event).run();
  return event;
}

export function seedTestAttendee(db: ReturnType<typeof createTestDb>, overrides: Partial<schema.NewAttendee> = {}) {
  const attendee: schema.NewAttendee = {
    id: overrides.id || "test-attendee-1",
    email: overrides.email || "test@example.com",
    name: overrides.name || "Test User",
  };

  db.insert(schema.attendees).values(attendee).run();
  return attendee;
}

export function createMockRequest(url: string, options: RequestInit = {}) {
  return new Request(url, options);
}

export function createFormData(data: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value);
  }
  return formData;
}

export function seedTestRsvp(
  db: ReturnType<typeof createTestDb>,
  overrides: Partial<schema.NewRSVP> & { eventId: string; attendeeId: string }
) {
  const rsvp: schema.NewRSVP = {
    id: overrides.id || "test-rsvp-1",
    eventId: overrides.eventId,
    attendeeId: overrides.attendeeId,
    status: overrides.status || "yes",
    notes: overrides.notes || null,
    confirmationToken: overrides.confirmationToken || crypto.randomUUID(),
    checkinToken: overrides.checkinToken || crypto.randomUUID(),
  };

  db.insert(schema.rsvps).values(rsvp).run();
  return rsvp;
}

export function seedTestWaiver(
  db: ReturnType<typeof createTestDb>,
  overrides: Partial<schema.NewWaiver> & { eventId: string; attendeeId: string }
) {
  const waiver: schema.NewWaiver = {
    id: overrides.id || "test-waiver-1",
    eventId: overrides.eventId,
    attendeeId: overrides.attendeeId,
    waiverText: overrides.waiverText || JSON.stringify({ title: "Test Waiver", items: [] }),
    consents: overrides.consents || JSON.stringify({ liability: true }),
    ipAddress: overrides.ipAddress || "127.0.0.1",
    consent: overrides.consent ?? true,
  };

  db.insert(schema.waivers).values(waiver).run();
  return waiver;
}
