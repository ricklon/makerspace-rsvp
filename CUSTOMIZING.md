# Customizing Makerspace RSVP for Your Space

This guide helps you brand and configure Makerspace RSVP for your specific hackerspace, makerspace, or community workshop.

## Quick Customization Checklist

- [ ] Set makerspace name and contact info
- [ ] Update branding colors
- [ ] Add your logo
- [ ] Customize waiver text
- [ ] Configure email templates
- [ ] Set up custom domain
- [ ] Adjust event types for your space

## 1. Basic Configuration

### Environment Variables

Edit `.env` with your makerspace's details:

```bash
# Your Space's Identity
MAKERSPACE_NAME="Fubar Labs"
MAKERSPACE_URL=https://fubarlabs.org
MAKERSPACE_EMAIL=events@fubarlabs.org
FROM_EMAIL=events@fubarlabs.org

# Admin Access
ADMIN_EMAIL=admin@fubarlabs.org
ADMIN_PASSWORD_HASH=$2a$10$your_hash_here
```

### Wrangler Configuration

Update `wrangler.toml`:

```toml
name = "makerspace-rsvp-fubarlabs"  # Make it unique to your space
```

## 2. Visual Branding

### Colors and Theme

Edit `tailwind.config.ts` to match your brand:

```typescript
export default {
  theme: {
    extend: {
      colors: {
        // Your primary brand color
        primary: {
          DEFAULT: "hsl(221.2 83.2% 53.3%)", // Default blue
          foreground: "hsl(210 40% 98%)",
        },
        // Add custom colors
        brand: {
          yellow: "#FFD700",  // Example: Fubar's yellow
          black: "#000000",   // Example: Fubar's black
        },
      },
    },
  },
};
```

**Example color schemes:**

**Fubar Labs** (Yellow & Black):
```typescript
colors: {
  primary: {
    DEFAULT: "hsl(51 100% 50%)", // Yellow
    foreground: "hsl(0 0% 0%)",   // Black
  },
  brand: {
    yellow: "#FFD700",
    black: "#1a1a1a",
  },
}
```

**NYC Resistor** (Red & White):
```typescript
colors: {
  primary: {
    DEFAULT: "hsl(0 84% 60%)",    // Red
    foreground: "hsl(0 0% 100%)",  // White
  },
}
```

**Noisebridge** (Purple & Green):
```typescript
colors: {
  primary: {
    DEFAULT: "hsl(270 50% 40%)",   // Purple
    foreground: "hsl(0 0% 100%)",
  },
  accent: {
    DEFAULT: "hsl(120 60% 50%)",   // Green
  },
}
```

### Logo

1. Add your logo files to `public/`:
   ```
   public/
   ├── logo.svg          # For light backgrounds
   ├── logo-dark.svg     # For dark backgrounds
   └── favicon.ico       # Browser tab icon
   ```

2. Update the header in `app/routes/_index.tsx`:
   ```tsx
   <div className="flex items-center gap-3">
     <img src="/logo.svg" alt="Logo" className="h-10 w-10" />
     <h1 className="text-3xl font-bold">{process.env.MAKERSPACE_NAME} Events</h1>
   </div>
   ```

### Typography

Add custom fonts in `app/root.tsx`:

```tsx
export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  // Add Google Fonts
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { 
    rel: "stylesheet", 
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" 
  },
];
```

Update `tailwind.config.ts`:

```typescript
theme: {
  extend: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
    },
  },
}
```

## 3. Content Customization

### Homepage Text

Edit `app/routes/_index.tsx`:

```tsx
<div className="mb-8">
  <h2 className="text-2xl font-bold">Upcoming Events</h2>
  <p className="mt-2 text-gray-600">
    Robot combat, workshops, and community gatherings at New Jersey's first hackerspace
  </p>
</div>
```

### Footer

```tsx
<footer className="mt-16 bg-white">
  <div className="mx-auto max-w-7xl px-4 py-8">
    <p className="text-center text-sm text-gray-600">
      © {new Date().getFullYear()} {process.env.MAKERSPACE_NAME}
    </p>
    <div className="mt-4 flex justify-center gap-6 text-sm">
      <a href="https://yourspace.org/about">About</a>
      <a href="https://yourspace.org/contact">Contact</a>
      <a href="https://discord.gg/yourspace">Discord</a>
    </div>
  </div>
</footer>
```

### Meta Tags (SEO)

Update `app/routes/_index.tsx`:

```tsx
export const meta: MetaFunction = () => {
  return [
    { title: "Fubar Labs Events - RSVP System" },
    { 
      name: "description", 
      content: "RSVP for robot combat, workshops, and maker events at New Jersey's first hackerspace" 
    },
    { property: "og:image", content: "https://yourspace.org/og-image.jpg" },
  ];
};
```

## 4. Event Types Configuration

### Default Event Categories

Create a configuration file `app/config/events.ts`:

```typescript
export const eventTypes = [
  {
    id: "robot-combat",
    name: "Robot Combat",
    requiresWaiver: true,
    defaultCapacity: 50,
    description: "Battle bots competition",
  },
  {
    id: "workshop",
    name: "Workshop",
    requiresWaiver: false,
    defaultCapacity: 15,
    description: "Learn new skills",
  },
  {
    id: "open-night",
    name: "Open Hack Night",
    requiresWaiver: false,
    defaultCapacity: null, // Unlimited
    description: "Open workspace time",
  },
  // Add your custom event types
];
```

## 5. Waiver Customization

### Custom Waiver Text

Create waivers in `app/config/waivers.ts`:

```typescript
export const waivers = {
  robotCombat: `
ASSUMPTION OF RISK AND WAIVER OF LIABILITY

I understand that robot combat is inherently dangerous and involves risks including 
but not limited to: flying debris, electrical hazards, mechanical injuries, and damage 
to personal property.

I voluntarily assume all risks associated with participation and agree to:
- Follow all safety rules and instructions
- Wear appropriate safety equipment at all times
- Inspect my robot for safety before each match
- Not hold ${process.env.MAKERSPACE_NAME} liable for any injuries or damages

I have read and understand this waiver.
  `,
  
  generalWorkshop: `
WORKSHOP WAIVER

I understand that participation in ${process.env.MAKERSPACE_NAME} workshops involves 
the use of tools and equipment that may pose risks if used improperly.

I agree to:
- Follow all safety instructions
- Use tools only under supervision
- Report any unsafe conditions immediately

I voluntarily assume all risks and release ${process.env.MAKERSPACE_NAME} from liability.
  `,
};
```

Use in event creation (admin interface):

```tsx
<select name="waiverType">
  <option value="">No waiver required</option>
  <option value="robotCombat">Robot Combat Waiver</option>
  <option value="generalWorkshop">Workshop Waiver</option>
</select>
```

## 6. Email Templates

### Customize Email Content

Create `app/lib/email-templates.server.ts`:

```typescript
export function getRSVPConfirmationEmail(
  attendeeName: string,
  eventName: string,
  eventDate: string
) {
  const makerspaceName = process.env.MAKERSPACE_NAME || "Makerspace";
  
  return {
    subject: `RSVP Confirmed: ${eventName}`,
    html: `
      <h1>You're registered for ${eventName}!</h1>
      
      <p>Hi ${attendeeName},</p>
      
      <p>Your RSVP has been confirmed for:</p>
      <ul>
        <li><strong>Event:</strong> ${eventName}</li>
        <li><strong>Date:</strong> ${eventDate}</li>
        <li><strong>Location:</strong> ${makerspaceName}</li>
      </ul>
      
      <p>We look forward to seeing you!</p>
      
      <p>
        Questions? Reply to this email or visit our Discord.<br>
        - The ${makerspaceName} Team
      </p>
    `,
  };
}
```

### Email Styling

Use inline styles for better email client compatibility:

```typescript
const emailStyles = {
  container: 'font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;',
  header: 'background-color: #FFD700; padding: 20px; text-align: center;',
  body: 'padding: 20px; background-color: #ffffff;',
};
```

## 7. Custom Domain Setup

### Cloudflare Custom Domain

1. Add custom domain in Cloudflare Pages:
   - Go to your Pages project
   - Click "Custom domains"
   - Add `events.yourspace.org`

2. Update DNS:
   ```
   CNAME  events  makerspace-rsvp.pages.dev
   ```

3. SSL is automatic (Cloudflare handles it)

### Update Environment Variables

```bash
MAKERSPACE_URL=https://events.yourspace.org
```

## 8. Discord Integration

### Webhook Notifications

Set up Discord webhook in `.env`:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID
```

Create `app/lib/discord.server.ts`:

```typescript
export async function sendDiscordNotification(
  eventName: string,
  attendeeCount: number
) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `🎉 New RSVP for **${eventName}**! (${attendeeCount} attendees)`,
    }),
  });
}
```

## 9. Advanced Customization

### Multi-Location Support

If your space has multiple locations:

```typescript
// app/config/locations.ts
export const locations = {
  main: "195 Commerce Way, Cranford, NJ",
  workshop: "Workshop Building, Room 101",
  offsite: "External Venue",
};
```

### Membership Integration

Connect to your existing membership system:

```typescript
// app/lib/membership.server.ts
export async function checkMemberStatus(email: string) {
  // Query your membership database
  const member = await db.query.members.findFirst({
    where: eq(members.email, email),
  });
  
  return {
    isMember: !!member,
    memberSince: member?.joinDate,
    membershipLevel: member?.level,
  };
}
```

Give members priority RSVP access:

```typescript
// In RSVP action
const memberStatus = await checkMemberStatus(email);
if (event.capacity && currentRSVPs >= event.capacity && !memberStatus.isMember) {
  return json({ error: "Event is full. Members get priority access." });
}
```

## 10. Deployment Customization

### Environment-Specific Configuration

```typescript
// app/config/environment.ts
export const config = {
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
  
  makerspace: {
    name: process.env.MAKERSPACE_NAME || "Makerspace",
    url: process.env.MAKERSPACE_URL || "https://yourspace.org",
    email: process.env.MAKERSPACE_EMAIL || "events@yourspace.org",
  },
  
  features: {
    discordIntegration: !!process.env.DISCORD_WEBHOOK_URL,
    emailReminders: process.env.ENABLE_EMAIL_REMINDERS === "true",
    waitlistManagement: process.env.ENABLE_WAITLIST === "true",
  },
};
```

## Examples from Real Makerspaces

### Fubar Labs Configuration

```bash
MAKERSPACE_NAME="Fubar Labs"
MAKERSPACE_URL=https://fubarlabs.org
MAKERSPACE_EMAIL=events@fubarlabs.org
```

Color scheme: Yellow (#FFD700) and Black (#1a1a1a)

Event types:
- Mechanical Mayhem (robot combat) - requires waiver, capacity 50
- Open Hack Night - no waiver, unlimited capacity
- Workshops - no waiver, capacity 15-20

### Your Space Here!

Once you customize Makerspace RSVP for your space, consider:
1. Sharing your configuration as an example
2. Contributing customization features back to the project
3. Adding your space to the README's "Who Uses This?" section

## Need Help?

- Check the main [README.md](README.md) for general setup
- See [CLAUDE.md](CLAUDE.md) for development details
- Open a GitHub issue for customization questions
- Join our community Discord (coming soon)

---

**Share your customizations!** We'd love to see how you've branded Makerspace RSVP for your space.
