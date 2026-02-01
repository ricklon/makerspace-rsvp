# Makerspace RSVP

> **Open-source event management for makerspaces, hackerspaces, and community workshops.**

Handle RSVPs, digital waivers, and event check-ins with a modern, self-hosted system built on Cloudflare's free tier.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Remix](https://img.shields.io/badge/Built%20with-Remix-000000?logo=remix)](https://remix.run)
[![Deploy to Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare-F38020?logo=cloudflare)](https://pages.cloudflare.com)

## Features

- 📅 **Multi-event management** - Robot combat, workshops, open houses, classes
- ✉️ **RSVP system** - Email confirmations, capacity management, waitlists
- 📝 **Digital waivers** - Legally compliant waiver signing with IP tracking
- ✅ **Check-in system** - QR codes, manual check-in, attendance tracking
- 📊 **Admin dashboard** - Manage events, view stats, export data
- 📱 **Mobile-friendly** - Works on phones for event check-ins
- 🎨 **Customizable** - Brand it for your space
- 💰 **Free to run** - Deploys on Cloudflare's generous free tier

## Who Uses This?

**Currently in production at:**
- [Fubar Labs](https://fubarlabs.org) - New Jersey's first hackerspace (original developer)

**Perfect for:**
- Makerspaces and hackerspaces
- Community workshops
- Fab labs and TechShops
- DIY/maker groups
- Robotics clubs
- Any community event organizer

## Why Makerspace RSVP?

Most event management tools are:
- 💸 Too expensive for volunteer-run spaces
- 🔒 Not self-hosted (you don't own your data)
- 🎯 Too general-purpose (don't handle waivers, capacity limits, check-ins)
- 📱 Poor mobile experience for event day

**Makerspace RSVP is built specifically for maker communities:**
- Free to run (Cloudflare's free tier handles 100k+ requests/day)
- Self-hosted (you control your data and members' information)
- Purpose-built (waivers for robot combat, capacity for workshops)
- Mobile-first (check people in on your phone)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Cloudflare account (free tier works great)
- Clerk account (free tier available at [clerk.com](https://clerk.com))

### 1. Clone and Install

```bash
git clone https://github.com/fubarlabs/makerspace-rsvp.git
cd makerspace-rsvp
pnpm install
```

### 2. Configure Your Makerspace

```bash
cp .env.example .env
# Edit .env with your makerspace's details
```

### 3. Set Up Cloudflare

```bash
# Login to Cloudflare
pnpm wrangler login

# Create database
pnpm wrangler d1 create makerspace-rsvp-YOUR_SPACE_NAME

# Create sessions storage
pnpm wrangler kv:namespace create sessions

# Update wrangler.toml with your IDs
```

### 4. Run Migrations

```bash
pnpm db:generate
pnpm db:migrate:prod
```

### 5. Start Development

```bash
pnpm dev
# Open http://localhost:3000
```

**📚 Full setup guide:** See [QUICKSTART.md](QUICKSTART.md)

## Tech Stack

- **Framework**: Remix 2.x (React Router v6)
- **UI**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Database**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle ORM (type-safe queries)
- **Auth**: Clerk (OAuth, role-based access)
- **Deployment**: Cloudflare Pages + Workers
- **Email**: Resend or SendGrid
- **Package Manager**: pnpm

## Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Get up and running in 10 minutes
- **[CLAUDE.md](CLAUDE.md)** - Comprehensive development guide
- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - Understand the codebase
- **[CUSTOMIZING.md](CUSTOMIZING.md)** - Brand it for your space
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Help improve this project

## Customization

Every makerspace is different! Customize:

- **Branding** - Colors, logo, name
- **Event types** - Workshops, robot combat, open hack nights
- **Waiver text** - Match your insurance requirements
- **Email templates** - Match your space's voice
- **Check-in workflow** - QR codes, manual, or both

See [CUSTOMIZING.md](CUSTOMIZING.md) for details.

## Authentication & Admin Access

Authentication is handled by [Clerk](https://clerk.com), providing secure OAuth login (Google, GitHub, etc.).

### Role-Based Access

- **super_admin** - Full access, can approve/deny admin requests
- **admin** - Can manage events and view attendees
- **user** - Can RSVP to events and view their reservations

### Setting Up the First Admin

1. Have a user sign in and request admin access at `/admin`
2. Set their role directly via Clerk API or Dashboard:
   ```bash
   curl -X PATCH "https://api.clerk.com/v1/users/USER_ID/metadata" \
     -H "Authorization: Bearer YOUR_CLERK_SECRET_KEY" \
     -H "Content-Type: application/json" \
     -d '{"public_metadata": {"role": "super_admin"}}'
   ```
3. Configure Clerk session token to include metadata:
   - Clerk Dashboard → Sessions → Customize session token
   - Add: `{"publicMetadata": "{{user.public_metadata}}"}`

After the first super_admin is set up, they can approve future admin requests directly from `/admin/requests`.

## Deployment

### Option 1: Cloudflare Pages (Recommended)

**Cost:** Free for most makerspaces
**Limits:** 100k requests/day, 10 GB bandwidth/month

```bash
pnpm deploy
```

### Option 2: GitHub Auto-Deploy

1. Push to GitHub
2. Connect repo to Cloudflare Pages
3. Auto-deploys on every push to `main`

See [deployment guide](QUICKSTART.md#deployment) for details.

## Contributing

We welcome contributions from makerspaces everywhere! Ways to help:

- 🐛 **Report bugs** - Open an issue
- 💡 **Suggest features** - What does your space need?
- 🔧 **Submit PRs** - Fix bugs, add features
- 📖 **Improve docs** - Help others get started
- 🎨 **Share customizations** - Show us your branding

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Roadmap

**v0.1 (Current)** - Core RSVP functionality
- [x] Event management
- [x] RSVP system
- [x] Digital waivers
- [x] Check-in system
- [x] Admin dashboard

**v0.2** - Enhanced features
- [ ] Email reminders (24hr before event)
- [ ] Waitlist automation
- [ ] Equipment reservation system
- [ ] Calendar exports (iCal)
- [ ] Member directory integration

**v0.3** - Community features
- [ ] Discord bot integration
- [ ] Slack notifications
- [ ] Real-time check-in dashboard
- [ ] Event analytics
- [x] Multi-admin support with role-based access

**v1.0** - Production-ready
- [ ] Comprehensive test coverage
- [ ] Security audit
- [ ] Multi-tenant support
- [ ] API documentation
- [ ] Mobile app (optional)

## Community

- **GitHub Issues** - Bug reports and feature requests
- **Discussions** - Questions and ideas
- **Discord** - Real-time chat (link TBD)

## Built By Makers, For Makers

**Lead Developer:** [Fubar Labs](https://fubarlabs.org) - New Jersey's first hackerspace (est. 2009)

**Contributors:**
- Rick Anderson ([@rickanderson](https://github.com/rickanderson)) - Director of Emerging Technology, Rutgers University
- [Your name here] - We welcome contributors!

## License

MIT License - see [LICENSE](LICENSE) for details.

**TL;DR:** Free to use, modify, and distribute. If you improve it, consider contributing back!

## Support

- **Documentation:** Read [QUICKSTART.md](QUICKSTART.md) and [CLAUDE.md](CLAUDE.md)
- **Issues:** Open a GitHub issue
- **Security:** Email security@fubarlabs.org

## Acknowledgments

Built with amazing open-source tools:
- [Remix](https://remix.run) - Full-stack React framework
- [Cloudflare](https://cloudflare.com) - Edge hosting and databases
- [Drizzle ORM](https://orm.drizzle.team) - Type-safe database queries
- [shadcn/ui](https://ui.shadcn.com) - Beautiful React components
- [Tailwind CSS](https://tailwindcss.com) - Utility-first CSS

---

**⭐ If this helps your makerspace, please star the repo!**

Made with ❤️ by the maker community
