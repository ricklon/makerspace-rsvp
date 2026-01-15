# Contributing to Makerspace RSVP

Thank you for considering contributing to Makerspace RSVP! This project is built by the maker community, for the maker community. Every contribution helps makerspaces worldwide.

## 🎯 Ways to Contribute

### 🐛 Report Bugs
Found a bug? [Open an issue](https://github.com/fubarlabs/makerspace-rsvp/issues/new) with:
- Clear title describing the issue
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Your environment (browser, OS, etc.)

### 💡 Suggest Features
Have an idea? [Open a discussion](https://github.com/fubarlabs/makerspace-rsvp/discussions) or issue with:
- Use case from your makerspace
- How it would benefit other spaces
- Potential implementation approach

### 📖 Improve Documentation
Help others get started:
- Fix typos or unclear instructions
- Add examples from your makerspace
- Translate documentation
- Write tutorials or blog posts

### 🔧 Submit Code
Fix bugs, add features, improve performance:
- See "Development Workflow" below
- Follow code standards
- Write tests
- Update documentation

### 🎨 Share Customizations
Show how you've customized for your space:
- Add your space to the README
- Share color schemes or themes
- Contribute reusable components
- Document integration patterns

## 🚀 Development Workflow

### 1. Fork and Clone

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/makerspace-rsvp.git
cd makerspace-rsvp
git remote add upstream https://github.com/fubarlabs/makerspace-rsvp.git
```

### 2. Set Up Development Environment

```bash
pnpm install
cp .env.example .env
# Edit .env with your test values

# Set up local database
pnpm wrangler login
pnpm wrangler d1 create makerspace-rsvp-dev
# Update wrangler.toml with database_id

pnpm db:generate
pnpm db:migrate:prod
```

### 3. Create a Branch

Use descriptive branch names:

```bash
# Features
git checkout -b feature/email-reminders
git checkout -b feature/discord-bot

# Bugs
git checkout -b fix/rsvp-validation
git checkout -b fix/waiver-signature

# Documentation
git checkout -b docs/setup-guide
git checkout -b docs/customization-examples
```

### 4. Make Changes

Follow our development standards:

**Code Style:**
- TypeScript strict mode
- Functional React components
- Server-side rendering preferred
- Accessibility (WCAG 2.1 AA)

**Testing:**
- Write tests for new features
- Maintain >80% code coverage
- All tests must pass before PR

**Commits:**
Use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add email reminder scheduling
fix: resolve RSVP capacity check bug
docs: update deployment guide
test: add E2E tests for check-in flow
refactor: simplify event creation form
chore: update dependencies
```

### 5. Test Your Changes

```bash
# Type check
pnpm typecheck

# Lint
pnpm lint

# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Run all checks
pnpm validate
```

### 6. Push and Create PR

```bash
git push origin feature/your-feature

# Create PR via GitHub CLI
gh pr create --title "feat: add email reminders" --body "Description of changes"

# Or create PR on GitHub web interface
```

## 📋 Pull Request Guidelines

### PR Title
Use conventional commit format:
```
feat: add Discord bot integration
fix: resolve waiver signature validation
docs: add deployment troubleshooting guide
```

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Motivation
Why is this change needed? What problem does it solve?

## Changes
- List of changes made
- Files modified or added
- Any breaking changes

## Testing
- [ ] Unit tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed
- [ ] Tested on mobile

## Screenshots (if applicable)
Before/after screenshots for UI changes

## Checklist
- [ ] Code follows project style guidelines
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No console errors or warnings
```

### Review Process

1. **Automated checks** - CI runs tests, linting, type checking
2. **Maintainer review** - Code review by Fubar Labs team
3. **Community feedback** - Other contributors may comment
4. **Revisions** - Make requested changes
5. **Merge** - PR merged to `main` branch

## 🎨 Code Standards

### TypeScript

```typescript
// ✅ Good
export async function createEvent(data: NewEvent): Promise<Event> {
  const db = getDb();
  const [event] = await db.insert(events).values(data).returning();
  return event;
}

// ❌ Bad
export async function createEvent(data) {
  const db = getDb();
  return await db.insert(events).values(data).returning();
}
```

### React Components

```tsx
// ✅ Good - Functional component with props interface
interface EventCardProps {
  event: Event;
  onRSVP: (eventId: string) => void;
}

export function EventCard({ event, onRSVP }: EventCardProps) {
  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold">{event.name}</h3>
      <button onClick={() => onRSVP(event.id)}>RSVP</button>
    </div>
  );
}

// ❌ Bad - Class component, no types
export class EventCard extends React.Component {
  render() {
    return <div>{this.props.event.name}</div>;
  }
}
```

### Database Queries

```typescript
// ✅ Good - Use Drizzle ORM, typed
const upcomingEvents = await db
  .select()
  .from(events)
  .where(
    and(
      eq(events.status, "published"),
      gte(events.date, new Date().toISOString())
    )
  )
  .orderBy(events.date);

// ❌ Bad - Raw SQL (unless absolutely necessary)
const upcomingEvents = await db.execute(
  "SELECT * FROM events WHERE status = 'published' ORDER BY date"
);
```

### Accessibility

```tsx
// ✅ Good - Proper ARIA labels, keyboard navigation
<button
  onClick={handleRSVP}
  aria-label={`RSVP for ${event.name}`}
  className="btn-primary"
>
  RSVP Now
</button>

// ❌ Bad - No accessibility
<div onClick={handleRSVP}>RSVP</div>
```

## 🧪 Testing Standards

### Unit Tests (Vitest)

Test loaders, actions, and utilities:

```typescript
// tests/routes/events.test.tsx
import { loader } from "~/routes/events.$slug";

describe("Event detail loader", () => {
  it("should load event by slug", async () => {
    const response = await loader({
      params: { slug: "test-event" },
      context: mockContext,
    });
    const data = await response.json();
    
    expect(data.event).toBeDefined();
    expect(data.event.slug).toBe("test-event");
  });
});
```

### E2E Tests (Playwright)

Test complete user workflows:

```typescript
// tests/e2e/rsvp-flow.spec.ts
import { test, expect } from "@playwright/test";

test("user can RSVP for an event", async ({ page }) => {
  await page.goto("/");
  await page.click('text="Mechanical Mayhem"');
  
  await page.fill('[name="name"]', "Test User");
  await page.fill('[name="email"]', "test@example.com");
  await page.click('button:has-text("Submit RSVP")');
  
  await expect(page.locator('text="RSVP Confirmed"')).toBeVisible();
});
```

## 📚 Documentation Standards

### Code Comments

```typescript
/**
 * Generate QR code for event check-in
 * 
 * @param eventId - UUID of the event
 * @param attendeeId - UUID of the attendee
 * @returns Base64-encoded QR code image
 */
export async function generateCheckInQR(
  eventId: string,
  attendeeId: string
): Promise<string> {
  // Implementation
}
```

### README Updates

When adding features:
- Update main README.md feature list
- Add to QUICKSTART.md if it affects setup
- Document in CUSTOMIZING.md if it's configurable
- Add examples to CLAUDE.md

## 🏷️ Issue Labels

We use these labels to organize issues:

- `bug` - Something isn't working
- `feature` - New feature request
- `enhancement` - Improvement to existing feature
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `makerspace-specific` - Specific to certain spaces
- `breaking change` - Requires migration or config changes

## 🤝 Community Guidelines

### Be Respectful
- Be kind and courteous
- Respect different viewpoints
- Give constructive feedback
- Assume good intentions

### Be Collaborative
- Help others get started
- Share knowledge
- Review PRs thoughtfully
- Celebrate contributions

### Be Professional
- Keep discussions on-topic
- No spam or self-promotion
- Follow the Code of Conduct
- Resolve conflicts respectfully

## 🎓 Learning Resources

New to contributing? Start here:

- [First Contributions](https://github.com/firstcontributions/first-contributions) - Tutorial for first-time contributors
- [Remix Tutorial](https://remix.run/docs/en/main/start/tutorial) - Learn Remix
- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview) - Database queries
- [Conventional Commits](https://www.conventionalcommits.org/) - Commit message format

## 📞 Getting Help

Stuck? We're here to help:

- 💬 [GitHub Discussions](https://github.com/fubarlabs/makerspace-rsvp/discussions) - Ask questions
- 🐛 [GitHub Issues](https://github.com/fubarlabs/makerspace-rsvp/issues) - Report bugs
- 📖 [Documentation](README.md) - Read the docs
- 💌 Email: dev@fubarlabs.org

## 🌟 Recognition

Contributors are recognized in:
- README.md contributors section
- GitHub contributors page
- Release notes
- Project website (coming soon)

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for helping make Makerspace RSVP better for everyone!** 🙏

Every contribution, no matter how small, makes a difference for makerspaces worldwide.
