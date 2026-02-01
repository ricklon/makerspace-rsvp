import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Event Series table - template for recurring events
export const eventSeries = sqliteTable(
  "event_series",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description").notNull(),
    timeStart: text("time_start").notNull(), // ISO time string (HH:MM)
    timeEnd: text("time_end"), // ISO time string (HH:MM) - nullable
    location: text("location").notNull(),
    capacity: integer("capacity"), // null = unlimited
    requiresWaiver: integer("requires_waiver", { mode: "boolean" })
      .notNull()
      .default(false),
    waiverText: text("waiver_text"),
    discordLink: text("discord_link"),
    // Recurrence settings
    recurrenceRule: text("recurrence_rule").notNull(), // JSON string with pattern definition
    startDate: text("start_date").notNull(), // First occurrence (YYYY-MM-DD)
    endDate: text("end_date"), // End by date (YYYY-MM-DD) - nullable
    maxOccurrences: integer("max_occurrences"), // End by count - nullable
    status: text("status", { enum: ["active", "paused", "ended"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    statusIdx: index("series_status_idx").on(table.status),
    startDateIdx: index("series_start_date_idx").on(table.startDate),
  })
);

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
    // Series relationship fields
    seriesId: text("series_id").references(() => eventSeries.id, { onDelete: "set null" }),
    seriesInstanceDate: text("series_instance_date"), // Original scheduled date from series
    isSeriesException: integer("is_series_exception", { mode: "boolean" })
      .notNull()
      .default(false), // True if modified from template
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
    seriesIdIdx: index("series_id_idx").on(table.seriesId),
  })
);

// Attendees table
export const attendees = sqliteTable(
  "attendees",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    clerkUserId: text("clerk_user_id"), // Optional - links to Clerk user if signed in
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    emailIdx: index("email_idx").on(table.email),
    clerkUserIdIdx: index("clerk_user_id_idx").on(table.clerkUserId),
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
    // Tokens for privacy-preserving URLs (no email in query params)
    confirmationToken: text("confirmation_token")
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    checkinToken: text("checkin_token")
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
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
    confirmationTokenIdx: index("rsvp_confirmation_token_idx").on(table.confirmationToken),
    checkinTokenIdx: index("rsvp_checkin_token_idx").on(table.checkinToken),
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
    waiverText: text("waiver_text").notNull(), // Snapshot of waiver config at signing time (JSON)
    consents: text("consents").notNull(), // JSON object of {itemId: boolean} for each waiver item
    signedAt: text("signed_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    ipAddress: text("ip_address").notNull(),
    consent: integer("consent", { mode: "boolean" }).notNull(), // True if all required items agreed
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

// Admin access requests table
export const adminRequests = sqliteTable(
  "admin_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    reason: text("reason"), // Optional reason for requesting access
    status: text("status", { enum: ["pending", "approved", "denied"] })
      .notNull()
      .default("pending"),
    reviewedBy: text("reviewed_by"), // Clerk user ID of admin who reviewed
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    clerkUserIdIdx: index("admin_request_clerk_user_id_idx").on(table.clerkUserId),
    statusIdx: index("admin_request_status_idx").on(table.status),
  })
);

// Type exports
export type EventSeries = typeof eventSeries.$inferSelect;
export type NewEventSeries = typeof eventSeries.$inferInsert;
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
export type AdminRequest = typeof adminRequests.$inferSelect;
export type NewAdminRequest = typeof adminRequests.$inferInsert;
