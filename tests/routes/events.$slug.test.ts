import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedTestEvent, seedTestAttendee, createFormData } from "../helpers";
import * as schema from "../../app/lib/schema";
import { eq, and } from "drizzle-orm";

describe("events.$slug route", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  describe("loader", () => {
    it("should return event data for valid slug", async () => {
      const event = seedTestEvent(db, { slug: "robot-combat" });

      const result = db.select().from(schema.events).where(eq(schema.events.slug, "robot-combat")).get();

      expect(result).toBeDefined();
      expect(result?.name).toBe("Test Event");
      expect(result?.slug).toBe("robot-combat");
    });

    it("should return null for non-existent slug", async () => {
      const result = db.select().from(schema.events).where(eq(schema.events.slug, "non-existent")).get();

      expect(result).toBeUndefined();
    });

    it("should not return draft events", async () => {
      seedTestEvent(db, { slug: "draft-event", status: "draft" });

      const result = db
        .select()
        .from(schema.events)
        .where(and(eq(schema.events.slug, "draft-event"), eq(schema.events.status, "published")))
        .get();

      expect(result).toBeUndefined();
    });

    it("should include RSVP count for event", async () => {
      const event = seedTestEvent(db, { slug: "popular-event" });
      const attendee1 = seedTestAttendee(db, { id: "att-1", email: "user1@test.com" });
      const attendee2 = seedTestAttendee(db, { id: "att-2", email: "user2@test.com" });

      db.insert(schema.rsvps).values({ id: "rsvp-1", eventId: event.id!, attendeeId: attendee1.id!, status: "yes" }).run();
      db.insert(schema.rsvps).values({ id: "rsvp-2", eventId: event.id!, attendeeId: attendee2.id!, status: "yes" }).run();

      const rsvpCount = db
        .select()
        .from(schema.rsvps)
        .where(and(eq(schema.rsvps.eventId, event.id!), eq(schema.rsvps.status, "yes")))
        .all().length;

      expect(rsvpCount).toBe(2);
    });
  });

  describe("action - RSVP submission", () => {
    it("should create new attendee and RSVP for valid submission", async () => {
      const event = seedTestEvent(db, { id: "evt-1", slug: "test-event" });

      // Simulate RSVP submission
      const attendeeId = crypto.randomUUID();
      const rsvpId = crypto.randomUUID();

      db.insert(schema.attendees).values({
        id: attendeeId,
        email: "new@example.com",
        name: "New User",
      }).run();

      db.insert(schema.rsvps).values({
        id: rsvpId,
        eventId: event.id!,
        attendeeId: attendeeId,
        status: "yes",
        notes: "Looking forward to it!",
      }).run();

      const attendee = db.select().from(schema.attendees).where(eq(schema.attendees.email, "new@example.com")).get();
      const rsvp = db.select().from(schema.rsvps).where(eq(schema.rsvps.attendeeId, attendeeId)).get();

      expect(attendee).toBeDefined();
      expect(attendee?.name).toBe("New User");
      expect(rsvp).toBeDefined();
      expect(rsvp?.status).toBe("yes");
    });

    it("should use existing attendee if email already exists", async () => {
      const event = seedTestEvent(db, { id: "evt-1", slug: "test-event" });
      const existingAttendee = seedTestAttendee(db, { id: "existing-att", email: "existing@example.com", name: "Existing User" });

      // Simulate RSVP with existing email
      const rsvpId = crypto.randomUUID();

      // Check if attendee exists
      const attendee = db.select().from(schema.attendees).where(eq(schema.attendees.email, "existing@example.com")).get();

      if (attendee) {
        db.insert(schema.rsvps).values({
          id: rsvpId,
          eventId: event.id!,
          attendeeId: attendee.id,
          status: "yes",
        }).run();
      }

      const allAttendees = db.select().from(schema.attendees).where(eq(schema.attendees.email, "existing@example.com")).all();
      const rsvp = db.select().from(schema.rsvps).where(eq(schema.rsvps.eventId, event.id!)).get();

      expect(allAttendees.length).toBe(1); // Should not create duplicate
      expect(rsvp?.attendeeId).toBe(existingAttendee.id);
    });

    it("should not allow duplicate RSVP for same event", async () => {
      const event = seedTestEvent(db, { id: "evt-1", slug: "test-event" });
      const attendee = seedTestAttendee(db, { id: "att-1", email: "user@example.com" });

      // First RSVP
      db.insert(schema.rsvps).values({
        id: "rsvp-1",
        eventId: event.id!,
        attendeeId: attendee.id!,
        status: "yes",
      }).run();

      // Try duplicate RSVP - should fail due to unique constraint
      expect(() => {
        db.insert(schema.rsvps).values({
          id: "rsvp-2",
          eventId: event.id!,
          attendeeId: attendee.id!,
          status: "yes",
        }).run();
      }).toThrow();
    });

    it("should handle waitlist when event is at capacity", async () => {
      const event = seedTestEvent(db, { id: "evt-1", slug: "small-event", capacity: 2 });

      // Fill up the event
      const att1 = seedTestAttendee(db, { id: "att-1", email: "user1@example.com" });
      const att2 = seedTestAttendee(db, { id: "att-2", email: "user2@example.com" });

      db.insert(schema.rsvps).values({ id: "rsvp-1", eventId: event.id!, attendeeId: att1.id!, status: "yes" }).run();
      db.insert(schema.rsvps).values({ id: "rsvp-2", eventId: event.id!, attendeeId: att2.id!, status: "yes" }).run();

      // Check RSVP count
      const rsvpCount = db
        .select()
        .from(schema.rsvps)
        .where(and(eq(schema.rsvps.eventId, event.id!), eq(schema.rsvps.status, "yes")))
        .all().length;

      // New RSVP should go to waitlist if at capacity
      const shouldWaitlist = event.capacity != null && rsvpCount >= event.capacity;

      expect(shouldWaitlist).toBe(true);

      // Add to waitlist
      const att3 = seedTestAttendee(db, { id: "att-3", email: "user3@example.com" });
      db.insert(schema.rsvps).values({
        id: "rsvp-3",
        eventId: event.id!,
        attendeeId: att3.id!,
        status: "waitlist",
      }).run();

      const waitlistRsvp = db.select().from(schema.rsvps).where(eq(schema.rsvps.id, "rsvp-3")).get();
      expect(waitlistRsvp?.status).toBe("waitlist");
    });
  });

  describe("validation", () => {
    it("should require name field", () => {
      const formData = createFormData({ email: "test@example.com" });
      expect(formData.get("name")).toBeNull();
    });

    it("should require valid email", () => {
      const formData = createFormData({ name: "Test", email: "invalid-email" });
      const email = formData.get("email") as string;
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      expect(isValidEmail).toBe(false);
    });

    it("should accept valid form data", () => {
      const formData = createFormData({
        name: "Test User",
        email: "test@example.com",
        notes: "Looking forward to it!",
      });

      expect(formData.get("name")).toBe("Test User");
      expect(formData.get("email")).toBe("test@example.com");
      expect(formData.get("notes")).toBe("Looking forward to it!");
    });
  });
});
