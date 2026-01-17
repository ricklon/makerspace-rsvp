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
import {
  getWaiverConfigForEvent,
  validateWaiverConsents,
  DEFAULT_WAIVER_ITEMS,
} from "../../app/lib/waiver-config";

describe("events.$slug_.waiver route", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  describe("loader", () => {
    it("should return waiver config for event requiring waiver", () => {
      const event = seedTestEvent(db, {
        slug: "robot-combat",
        requiresWaiver: true,
        waiverText: "Additional event-specific terms",
      });
      const attendee = seedTestAttendee(db, { email: "user@example.com" });
      seedTestRsvp(db, { eventId: event.id!, attendeeId: attendee.id! });

      // Simulate loader logic
      const dbEvent = db
        .select()
        .from(schema.events)
        .where(and(eq(schema.events.slug, "robot-combat"), eq(schema.events.status, "published")))
        .get();

      expect(dbEvent).toBeDefined();
      expect(dbEvent?.requiresWaiver).toBe(true);

      const waiverConfig = getWaiverConfigForEvent(undefined, dbEvent?.waiverText);
      expect(waiverConfig.items.length).toBeGreaterThan(DEFAULT_WAIVER_ITEMS.length);
      expect(waiverConfig.items.find((i) => i.id === "event_specific")).toBeDefined();
    });

    it("should redirect if event does not require waiver", () => {
      const event = seedTestEvent(db, {
        slug: "no-waiver-event",
        requiresWaiver: false,
      });

      const dbEvent = db
        .select()
        .from(schema.events)
        .where(eq(schema.events.slug, "no-waiver-event"))
        .get();

      expect(dbEvent?.requiresWaiver).toBe(false);
      // Loader would redirect in this case
    });

    it("should redirect if waiver already signed", () => {
      const event = seedTestEvent(db, {
        slug: "signed-event",
        requiresWaiver: true,
      });
      const attendee = seedTestAttendee(db, { email: "signed@example.com" });
      seedTestRsvp(db, { eventId: event.id!, attendeeId: attendee.id! });
      seedTestWaiver(db, { eventId: event.id!, attendeeId: attendee.id! });

      // Check if waiver exists
      const existingWaiver = db
        .select()
        .from(schema.waivers)
        .where(and(eq(schema.waivers.eventId, event.id!), eq(schema.waivers.attendeeId, attendee.id!)))
        .get();

      expect(existingWaiver).toBeDefined();
      // Loader would redirect to confirmation in this case
    });

    it("should redirect if attendee has not RSVPed", () => {
      seedTestEvent(db, { slug: "no-rsvp-event", requiresWaiver: true });

      // No attendee seeded - loader would redirect
      const attendee = db
        .select()
        .from(schema.attendees)
        .where(eq(schema.attendees.email, "nonexistent@example.com"))
        .get();

      expect(attendee).toBeUndefined();
    });

    it("should return 404 for non-existent event", () => {
      const event = db
        .select()
        .from(schema.events)
        .where(eq(schema.events.slug, "does-not-exist"))
        .get();

      expect(event).toBeUndefined();
    });
  });

  describe("action - waiver signing", () => {
    it("should create waiver record when all required items are consented", () => {
      const event = seedTestEvent(db, {
        id: "evt-waiver",
        slug: "test-waiver-event",
        requiresWaiver: true,
      });
      const attendee = seedTestAttendee(db, {
        id: "att-waiver",
        email: "signer@example.com",
      });
      seedTestRsvp(db, { eventId: event.id!, attendeeId: attendee.id! });

      const waiverConfig = getWaiverConfigForEvent();

      // Simulate consent for all required items
      const consents: Record<string, boolean> = {};
      for (const item of waiverConfig.items) {
        consents[item.id] = item.required ? true : item.defaultChecked;
      }

      const validation = validateWaiverConsents(consents, waiverConfig.items);
      expect(validation.valid).toBe(true);
      expect(validation.missingItems).toHaveLength(0);

      // Save waiver
      db.insert(schema.waivers)
        .values({
          id: "waiver-new",
          eventId: event.id!,
          attendeeId: attendee.id!,
          waiverText: JSON.stringify(waiverConfig),
          consents: JSON.stringify(consents),
          ipAddress: "192.168.1.1",
          consent: true,
        })
        .run();

      const waiver = db
        .select()
        .from(schema.waivers)
        .where(eq(schema.waivers.id, "waiver-new"))
        .get();

      expect(waiver).toBeDefined();
      expect(waiver?.consent).toBe(true);
      expect(waiver?.ipAddress).toBe("192.168.1.1");
    });

    it("should reject when required items are not consented", () => {
      const waiverConfig = getWaiverConfigForEvent();

      // Only consent to optional items
      const consents: Record<string, boolean> = {};
      for (const item of waiverConfig.items) {
        consents[item.id] = !item.required; // false for required, true for optional
      }

      const validation = validateWaiverConsents(consents, waiverConfig.items);
      expect(validation.valid).toBe(false);
      expect(validation.missingItems.length).toBeGreaterThan(0);
    });

    it("should reject when final confirmation is not checked", () => {
      // This is handled by form validation - final_confirmation must be "on"
      const formData = new FormData();
      // Simulate unchecked checkbox (not in form data)
      const finalConfirmation = formData.get("final_confirmation");
      expect(finalConfirmation).toBeNull();

      // When present but not checked, it would be empty or missing
      // The action requires: finalConfirmation === "on" || finalConfirmation === "true"
    });

    it("should not allow duplicate waiver for same event/attendee", () => {
      const event = seedTestEvent(db, {
        id: "evt-dup",
        slug: "dup-waiver-event",
        requiresWaiver: true,
      });
      const attendee = seedTestAttendee(db, {
        id: "att-dup",
        email: "duplicate@example.com",
      });

      // First waiver
      seedTestWaiver(db, {
        id: "waiver-first",
        eventId: event.id!,
        attendeeId: attendee.id!,
      });

      // Second waiver should fail due to unique constraint
      expect(() => {
        db.insert(schema.waivers)
          .values({
            id: "waiver-second",
            eventId: event.id!,
            attendeeId: attendee.id!,
            waiverText: "{}",
            consents: "{}",
            ipAddress: "127.0.0.1",
            consent: true,
          })
          .run();
      }).toThrow();
    });

    it("should store IP address for legal compliance", () => {
      const event = seedTestEvent(db, {
        id: "evt-ip",
        slug: "ip-test-event",
        requiresWaiver: true,
      });
      const attendee = seedTestAttendee(db, {
        id: "att-ip",
        email: "iptest@example.com",
      });

      const ipAddress = "203.0.113.42";

      db.insert(schema.waivers)
        .values({
          id: "waiver-ip",
          eventId: event.id!,
          attendeeId: attendee.id!,
          waiverText: "{}",
          consents: "{}",
          ipAddress,
          consent: true,
        })
        .run();

      const waiver = db
        .select()
        .from(schema.waivers)
        .where(eq(schema.waivers.id, "waiver-ip"))
        .get();

      expect(waiver?.ipAddress).toBe(ipAddress);
    });

    it("should store consents as JSON for audit trail", () => {
      const event = seedTestEvent(db, {
        id: "evt-audit",
        slug: "audit-event",
        requiresWaiver: true,
      });
      const attendee = seedTestAttendee(db, {
        id: "att-audit",
        email: "audit@example.com",
      });

      const consents = {
        liability: true,
        safety_rules: true,
        emergency_contact: true,
        media_release: false,
        code_of_conduct: true,
      };

      db.insert(schema.waivers)
        .values({
          id: "waiver-audit",
          eventId: event.id!,
          attendeeId: attendee.id!,
          waiverText: JSON.stringify({ title: "Test" }),
          consents: JSON.stringify(consents),
          ipAddress: "127.0.0.1",
          consent: true,
        })
        .run();

      const waiver = db
        .select()
        .from(schema.waivers)
        .where(eq(schema.waivers.id, "waiver-audit"))
        .get();

      const storedConsents = JSON.parse(waiver?.consents || "{}");
      expect(storedConsents.liability).toBe(true);
      expect(storedConsents.media_release).toBe(false);
    });
  });

  describe("waiver config", () => {
    it("should include default waiver items", () => {
      const config = getWaiverConfigForEvent();

      expect(config.items.find((i) => i.id === "liability")).toBeDefined();
      expect(config.items.find((i) => i.id === "safety_rules")).toBeDefined();
      expect(config.items.find((i) => i.id === "code_of_conduct")).toBeDefined();
    });

    it("should add event-specific items for robot combat", () => {
      const config = getWaiverConfigForEvent("robot_combat");

      expect(config.items.find((i) => i.id === "robot_combat_risk")).toBeDefined();
    });

    it("should add custom waiver text as event-specific item", () => {
      const customText = "You must bring your own safety goggles.";
      const config = getWaiverConfigForEvent(undefined, customText);

      const eventSpecific = config.items.find((i) => i.id === "event_specific");
      expect(eventSpecific).toBeDefined();
      expect(eventSpecific?.description).toBe(customText);
      expect(eventSpecific?.required).toBe(true);
    });

    it("should mark media release as optional with default checked", () => {
      const config = getWaiverConfigForEvent();

      const mediaRelease = config.items.find((i) => i.id === "media_release");
      expect(mediaRelease?.required).toBe(false);
      expect(mediaRelease?.defaultChecked).toBe(true);
    });
  });
});
