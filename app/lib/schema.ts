import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Events table
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull(),
    date: text("date").notNull(), // ISO date string (YYYY-MM-DD)
    timeStart: text("time_start").notNull(), // ISO time string (HH:MM)
    timeEnd: text("time_end"), // ISO time string (HH:MM) - nullable
    location: text("location").notNull(),
    capacity: integer("capacity"), // null = unlimited
    requiresWaiver: integer("requires_waiver", { mode: "boolean" })
      .notNull()
      .default(false),
    waiverText: text("waiver_text"),
    discordLink: text("discord_link"),
    status: text("status", { enum: ["draft", "published", "cancelled"] })
      .notNull()
      .default("draft"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    slugIdx: index("slug_idx").on(table.slug),
    dateIdx: index("date_idx").on(table.date),
    statusIdx: index("status_idx").on(table.status),
  })
);

// Attendees table
export const attendees = sqliteTable(
  "attendees",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    emailIdx: index("email_idx").on(table.email),
  })
);

// RSVPs table
export const rsvps = sqliteTable(
  "rsvps",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    attendeeId: text("attendee_id")
      .notNull()
      .references(() => attendees.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["yes", "no", "maybe", "waitlist", "cancelled"],
    })
      .notNull()
      .default("yes"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    eventIdIdx: index("rsvp_event_idx").on(table.eventId),
    attendeeIdIdx: index("rsvp_attendee_idx").on(table.attendeeId),
    uniqueRsvp: unique("unique_rsvp").on(table.eventId, table.attendeeId),
  })
);

// Waivers table
export const waivers = sqliteTable(
  "waivers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    attendeeId: text("attendee_id")
      .notNull()
      .references(() => attendees.id, { onDelete: "cascade" }),
    waiverText: text("waiver_text").notNull(), // Snapshot of waiver at signing time
    signedAt: text("signed_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    ipAddress: text("ip_address").notNull(),
    consent: integer("consent", { mode: "boolean" }).notNull(),
  },
  (table) => ({
    eventIdIdx: index("waiver_event_idx").on(table.eventId),
    attendeeIdIdx: index("waiver_attendee_idx").on(table.attendeeId),
    uniqueWaiver: unique("unique_waiver").on(table.eventId, table.attendeeId),
  })
);

// Attendance table
export const attendance = sqliteTable(
  "attendance",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    attendeeId: text("attendee_id")
      .notNull()
      .references(() => attendees.id, { onDelete: "cascade" }),
    checkedInAt: text("checked_in_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    checkInMethod: text("check_in_method", {
      enum: ["manual", "qr_code", "email_link"],
    })
      .notNull()
      .default("manual"),
  },
  (table) => ({
    eventIdIdx: index("attendance_event_idx").on(table.eventId),
    attendeeIdIdx: index("attendance_attendee_idx").on(table.attendeeId),
    uniqueAttendance: unique("unique_attendance").on(
      table.eventId,
      table.attendeeId
    ),
  })
);

// Type exports
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Attendee = typeof attendees.$inferSelect;
export type NewAttendee = typeof attendees.$inferInsert;
export type RSVP = typeof rsvps.$inferSelect;
export type NewRSVP = typeof rsvps.$inferInsert;
export type Waiver = typeof waivers.$inferSelect;
export type NewWaiver = typeof waivers.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;
