-- Seed data for local development
-- Run with: wrangler d1 execute makerspace-rsvp --local --file=db/seed.sql

INSERT INTO events (id, name, slug, description, date, time_start, time_end, location, capacity, requires_waiver, waiver_text, discord_link, status)
VALUES
  (
    'evt-001',
    'Robot Combat Competition',
    'robot-combat-feb-2026',
    'Bring your combat robots (up to 3lbs) and battle for glory! Safety glasses required, waivers must be signed. All skill levels welcome.',
    '2026-02-15',
    '10:00',
    '18:00',
    'Main Workshop Space',
    50,
    1,
    'I understand that robot combat is inherently dangerous and involves risks including but not limited to: flying debris, electrical hazards, mechanical injuries, and damage to personal property. I voluntarily assume all risks and agree to follow all safety rules.',
    'https://discord.gg/fubarlabs',
    'published'
  ),
  (
    'evt-002',
    'Arduino Workshop: Getting Started',
    'arduino-workshop-jan-2026',
    'Learn the basics of Arduino! We''ll cover circuits, sensors, and programming. No prior experience needed. All materials provided.',
    '2026-01-25',
    '14:00',
    '16:00',
    'Electronics Lab',
    15,
    0,
    NULL,
    NULL,
    'published'
  ),
  (
    'evt-003',
    'Open Hack Night',
    'open-hack-night-jan-2026',
    'Join us for our weekly open hack night! Bring your projects, get help from fellow makers, and explore our tools and equipment. Free and open to all.',
    '2026-01-20',
    '19:00',
    '22:00',
    'Main Space',
    NULL,
    0,
    NULL,
    NULL,
    'published'
  ),
  (
    'evt-004',
    '3D Printing Workshop',
    '3d-printing-workshop-feb-2026',
    'Learn to design and print 3D objects! We''ll cover CAD basics, slicing, and printing best practices. Bring your laptop with Fusion 360 or Blender installed.',
    '2026-02-08',
    '13:00',
    '16:00',
    'Digital Fabrication Lab',
    12,
    0,
    NULL,
    NULL,
    'published'
  ),
  (
    'evt-005',
    'Woodworking Safety Certification',
    'woodworking-safety-feb-2026',
    'Required certification to use woodworking equipment. Learn safe operation of table saw, miter saw, router, and other tools. Includes hands-on practice.',
    '2026-02-22',
    '10:00',
    '14:00',
    'Woodshop',
    8,
    1,
    'I understand that woodworking equipment is dangerous and can cause serious injury if used improperly. I agree to follow all safety rules and only use equipment I am certified to operate.',
    NULL,
    'published'
  );
