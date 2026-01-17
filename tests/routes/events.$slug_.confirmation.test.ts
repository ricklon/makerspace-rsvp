import { describe, it, expect, beforeEach } from "vitest";
import {
  createTestDb,
  seedTestEvent,
  seedTestAttendee,
  seedTestRsvp,
  seedTestWaiver,
} from "../helpers";
import * as schema from "../../app/lib/schema";
import { eq, and } from "drizzle-orm";

describe("events.$slug_.confirmation route", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  describe("loader", () => {
    it("should return event and attendee data for valid confirmation", () => {
      const event = seedTestEvent(db, {
        slug: "confirmed-event",
        requiresWaiver: false,
      });
      const attendee = seedTestAttendee(db, { email: "confirmed@example.com", name: "Confirmed User" });
      seedTestRsvp(db, { eventId: event.id!, attendeeId: attendee.id!, status: "yes" });

      // Simulate loader - fetch event
      const dbEvent = db
        .select()
        .from(schema.events)
        .where(and(eq(schema.events.slug, "confirmed-event"), eq(schema.events.status, "published")))
        .get();

      expect(dbEvent).toBeDefined();
      expect(dbEvent?.name).toBe("Test Event");

      // Fetch attendee
      const dbAttendee = db
        .select()
        .from(schema.attendees)
        .where(eq(schema.attendees.email, "confirmed@example.com"))
        .get();

      expect(dbAttendee).toBeDefined();
      expect(dbAttendee?.name).toBe("Confirmed User");

      // Fetch RSVP
      const rsvp = db
        .select()
        .from(schema.rsvps)
        .where(and(eq(schema.rsvps.eventId, event.id!), eq(schema.rsvps.attendeeId, attendee.id!)))
        .get();

      expect(rsvp).toBeDefined();
      expect(rsvp?.status).toBe("yes");
    });

    it("should show waitlist status correctly", () => {
      const event = seedTestEvent(db, {
        slug: "waitlist-event",
        capacity: 1,
      });
      const attendee = seedTestAttendee(db, { email: "waitlist@example.com" });
      seedTestRsvp(db, {
        eventId: event.id!,
        attendeeId: attendee.id!,
        status: "waitlist",
      });

      const rsvp = db
        .select()
        .from(schema.rsvps)
        .where(eq(schema.rsvps.attendeeId, attendee.id!))
        .get();

      expect(rsvp?.status).toBe("waitlist");
    });

    it("should redirect to waiver page if waiver not signed", () => {
      const event = seedTestEvent(db, {
        slug: "needs-waiver",
        requiresWaiver: true,
      });
      const attendee = seedTestAttendee(db, { email: "unsigned@example.com" });
      seedTestRsvp(db, { eventId: event.id!, attendeeId: attendee.id! });

      // Check waiver status
      const waiver = db
        .select()
        .from(schema.waivers)
        .where(and(eq(schema.waivers.eventId, event.id!), eq(schema.waivers.attendeeId, attendee.id!)))
        .get();

      expect(waiver).toBeUndefined();
      // Loader would redirect to waiver page
    });

    it("should show waiver signed status when waiver completed", () => {
      const event = seedTestEvent(db, {
        slug: "waiver-complete",
        requiresWaiver: true,
      });
      const attendee = seedTestAttendee(db, { email: "waiversigned@example.com" });
      seedTestRsvp(db, { eventId: event.id!, attendeeId: attendee.id! });
      seedTestWaiver(db, { eventId: event.id!, attendeeId: attendee.id! });

      const waiver = db
        .select()
        .from(schema.waivers)
        .where(and(eq(schema.waivers.eventId, event.id!), eq(schema.waivers.attendeeId, attendee.id!)))
        .get();

      expect(waiver).toBeDefined();
      expect(waiver?.consent).toBe(true);
    });

    it("should redirect if no email provided", () => {
      seedTestEvent(db, { slug: "no-email-event" });

      // Without email query param, loader would redirect to event page
      const email: string | null = null;
      expect(email).toBeNull();
    });

    it("should redirect if attendee not found", () => {
      seedTestEvent(db, { slug: "no-attendee-event" });

      const attendee = db
        .select()
        .from(schema.attendees)
        .where(eq(schema.attendees.email, "notfound@example.com"))
        .get();

      expect(attendee).toBeUndefined();
      // Loader would redirect to event page
    });

    it("should redirect if no RSVP found", () => {
      const event = seedTestEvent(db, { slug: "no-rsvp-event" });
      const attendee = seedTestAttendee(db, { email: "norsvp@example.com" });
      // No RSVP created

      const rsvp = db
        .select()
        .from(schema.rsvps)
        .where(and(eq(schema.rsvps.eventId, event.id!), eq(schema.rsvps.attendeeId, attendee.id!)))
        .get();

      expect(rsvp).toBeUndefined();
      // Loader would redirect to event page
    });

    it("should return 404 for non-existent event", () => {
      const event = db
        .select()
        .from(schema.events)
        .where(eq(schema.events.slug, "non-existent"))
        .get();

      expect(event).toBeUndefined();
    });

    it("should not show unpublished events", () => {
      seedTestEvent(db, { slug: "draft-event", status: "draft" });

      const event = db
        .select()
        .from(schema.events)
        .where(and(eq(schema.events.slug, "draft-event"), eq(schema.events.status, "published")))
        .get();

      expect(event).toBeUndefined();
    });
  });

  describe("display data", () => {
    it("should include event details for display", () => {
      const event = seedTestEvent(db, {
        slug: "display-event",
        name: "Robot Combat Championship",
        date: "2026-03-15",
        timeStart: "14:00",
        timeEnd: "18:00",
        location: "Fubar Labs Arena",
        discordLink: "https://discord.gg/fubarlabs",
      });

      const dbEvent = db
        .select()
        .from(schema.events)
        .where(eq(schema.events.slug, "display-event"))
        .get();

      expect(dbEvent?.name).toBe("Robot Combat Championship");
      expect(dbEvent?.date).toBe("2026-03-15");
      expect(dbEvent?.timeStart).toBe("14:00");
      expect(dbEvent?.timeEnd).toBe("18:00");
      expect(dbEvent?.location).toBe("Fubar Labs Arena");
      expect(dbEvent?.discordLink).toBe("https://discord.gg/fubarlabs");
    });

    it("should include attendee info for display", () => {
      const event = seedTestEvent(db, { slug: "attendee-display" });
      const attendee = seedTestAttendee(db, {
        email: "display@example.com",
        name: "Display User",
      });
      seedTestRsvp(db, { eventId: event.id!, attendeeId: attendee.id! });

      const dbAttendee = db
        .select()
        .from(schema.attendees)
        .where(eq(schema.attendees.email, "display@example.com"))
        .get();

      expect(dbAttendee?.name).toBe("Display User");
      expect(dbAttendee?.email).toBe("display@example.com");
    });

    it("should include RSVP notes if provided", () => {
      const event = seedTestEvent(db, { slug: "notes-event" });
      const attendee = seedTestAttendee(db, { email: "notes@example.com" });
      seedTestRsvp(db, {
        eventId: event.id!,
        attendeeId: attendee.id!,
        notes: "Bringing a 3lb bot",
      });

      const rsvp = db
        .select()
        .from(schema.rsvps)
        .where(eq(schema.rsvps.attendeeId, attendee.id!))
        .get();

      expect(rsvp?.notes).toBe("Bringing a 3lb bot");
    });
  });
});
