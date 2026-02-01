import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../app/lib/schema";

/**
 * Seed script for local development database
 *
 * Run with: pnpm db:seed
 *
 * This creates sample events for testing. Customize these for your makerspace!
 */

// Connect to local SQLite database
const sqlite = new Database("./dev.db");
const db = drizzle(sqlite, { schema });

// Example events - customize these for your space
const sampleEvents = [
  {
    name: "Robot Combat Competition",
    slug: "robot-combat-jan-2026",
    description:
      "Bring your combat robots (up to 3lbs) and battle for glory! Safety glasses required, waivers must be signed. All skill levels welcome.",
    date: "2026-02-15",
    timeStart: "10:00",
    timeEnd: "18:00",
    location: "Main Workshop Space",
    capacity: 50,
    requiresWaiver: true,
    waiverText: `I understand that robot combat is inherently dangerous and involves risks including but not limited to: flying debris, electrical hazards, mechanical injuries, and damage to personal property. I voluntarily assume all risks and agree to follow all safety rules.`,
    discordLink: "https://discord.gg/yourspace",
    status: "published" as const,
  },
  {
    name: "Arduino Workshop: Getting Started",
    slug: "arduino-workshop-jan-2026",
    description:
      "Learn the basics of Arduino! We'll cover circuits, sensors, and programming. No prior experience needed. All materials provided.",
    date: "2026-01-25",
    timeStart: "14:00",
    timeEnd: "16:00",
    location: "Electronics Lab",
    capacity: 15,
    requiresWaiver: false,
    status: "published" as const,
  },
  {
    name: "Open Hack Night",
    slug: "open-hack-night-jan-2026",
    description:
      "Join us for our weekly open hack night! Bring your projects, get help from fellow makers, and explore our tools and equipment. Free and open to all.",
    date: "2026-01-20",
    timeStart: "19:00",
    timeEnd: "22:00",
    location: "Main Space",
    capacity: null, // Unlimited
    requiresWaiver: false,
    status: "published" as const,
  },
  {
    name: "3D Printing Workshop",
    slug: "3d-printing-workshop-feb-2026",
    description:
      "Learn to design and print 3D objects! We'll cover CAD basics, slicing, and printing best practices. Bring your laptop with Fusion 360 or Blender installed.",
    date: "2026-02-08",
    timeStart: "13:00",
    timeEnd: "16:00",
    location: "Digital Fabrication Lab",
    capacity: 12,
    requiresWaiver: false,
    status: "draft" as const, // Not yet published
  },
  {
    name: "Woodworking Safety Certification",
    slug: "woodworking-safety-feb-2026",
    description:
      "Required certification to use woodworking equipment. Learn safe operation of table saw, miter saw, router, and other tools. Includes hands-on practice.",
    date: "2026-02-22",
    timeStart: "10:00",
    timeEnd: "14:00",
    location: "Woodshop",
    capacity: 8,
    requiresWaiver: true,
    waiverText: `I understand that woodworking equipment is dangerous and can cause serious injury if used improperly. I agree to follow all safety rules and only use equipment I am certified to operate.`,
    status: "published" as const,
  },
];

async function seed() {
  console.log("🌱 Seeding database...\n");

  // Clear existing events
  db.delete(schema.events).run();
  console.log("  Cleared existing events");

  // Insert sample events
  for (const event of sampleEvents) {
    db.insert(schema.events).values(event).run();
    console.log(`  ✓ Created: ${event.name}`);
  }

  console.log("\n✅ Seeding complete!");
  console.log(`   Added ${sampleEvents.length} events`);

  sqlite.close();
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
