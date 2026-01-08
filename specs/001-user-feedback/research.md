# Research: User Feedback Collection

**Feature**: 001-user-feedback
**Date**: 2026-01-07

## Technology Decisions

### 1. Screenshot Capture Library

**Decision**: `html2canvas`

**Rationale**:
- Pure JavaScript, no server-side dependencies
- Captures visible viewport as PNG
- Works across all modern browsers
- Widely adopted (40M+ weekly npm downloads)
- Lightweight (~40KB gzipped)

**Alternatives Considered**:
- `dom-to-image`: Smaller but less browser compatibility
- `html-to-image`: Fork of dom-to-image, similar limitations
- Browser native `MediaDevices.getDisplayMedia()`: Requires user permission prompt, not suitable for frictionless UX

**Implementation Notes**:
- Use `html2canvas(document.body, { useCORS: true })` for cross-origin images
- Convert to blob for Convex file upload
- Fallback gracefully if capture fails

---

### 2. GitHub API Integration

**Decision**: `@octokit/rest` (Official GitHub SDK)

**Rationale**:
- Official Octokit SDK maintained by GitHub
- TypeScript support out of the box
- Handles rate limiting and pagination
- Well-documented API
- Supports all GitHub Issues API features

**Alternatives Considered**:
- Raw `fetch` calls: More code, no retry handling, error-prone
- `octokit.js`: Older version, `@octokit/rest` is the successor
- GitHub GraphQL API: Overkill for simple issue creation

**Implementation Notes**:
- Use Personal Access Token (PAT) or GitHub App for authentication
- Store token in environment variable `GITHUB_TOKEN`
- Create issues in configured repository `GITHUB_REPO` (format: `owner/repo`)
- Labels: `bug`, `feature-request` (must exist in repo)

**API Endpoint Used**:
```typescript
octokit.rest.issues.create({
  owner: 'grootdev-ai',
  repo: 'finanseal-mvp',
  title: string,
  body: string,
  labels: ['bug'] | ['feature-request']
})
```

---

### 3. Database Schema (Convex)

**Decision**: New `feedback` table in Convex

**Rationale**:
- Follows existing pattern (all FinanSEAL data in Convex)
- Real-time updates for admin dashboard
- Convex file storage for screenshots
- Type-safe queries with TypeScript

**Alternatives Considered**:
- Supabase PostgreSQL: Would require two databases, inconsistent
- External service (Canny, Productboard): Out of scope for Phase 1

**Schema Design**:
```typescript
feedback: defineTable({
  type: v.union(v.literal("bug"), v.literal("feature"), v.literal("general")),
  message: v.string(),
  screenshotStorageId: v.optional(v.id("_storage")),
  pageUrl: v.string(),
  userAgent: v.string(),
  userId: v.optional(v.id("users")),
  businessId: v.optional(v.id("businesses")),
  isAnonymous: v.boolean(),
  status: v.union(v.literal("new"), v.literal("reviewed"), v.literal("resolved")),
  githubIssueUrl: v.optional(v.string()),
  githubIssueNumber: v.optional(v.number()),
  createdAt: v.number(),
})
```

---

### 4. Feedback Widget Architecture

**Decision**: Client-side floating component with modal

**Rationale**:
- Minimal bundle impact (lazy-loaded)
- No server component complexity
- Direct DOM access for screenshot capture
- Consistent with existing component patterns

**Implementation Pattern**:
```typescript
// Layout wrapper injects widget for authenticated users
<FeedbackWidget /> // Fixed position, z-50, bottom-right
  └── <FeedbackButton /> // Floating action button
  └── <FeedbackModal /> // Portal-based modal
      └── <FeedbackTypeSelector /> // 3 options
      └── <FeedbackForm /> // Textarea + screenshot
      └── <FeedbackConfirmation /> // Success state
```

**Alternatives Considered**:
- Iframe embed: Isolation good but harder to integrate with auth
- Third-party widget (Intercom): Out of scope for Phase 1
- Server component: Would complicate screenshot capture

---

### 5. Anonymous Feedback Handling

**Decision**: Store feedback with `isAnonymous: true` flag, omit `userId`

**Rationale**:
- Simple boolean flag for filtering
- User can still submit while logged in but choose anonymity
- Admin can see anonymous vs identified feedback

**Implementation Notes**:
- When `isAnonymous: true`, do not include user identifier in GitHub issue body
- Admin view shows "Anonymous" badge for such feedback
- Business context still captured (for multi-tenant filtering)

---

### 6. Team Notification System

**Decision**: Email notification via existing notification infrastructure

**Rationale**:
- FinanSEAL likely has existing email sending capability
- Simple, reliable, no new dependencies
- Can be extended to Slack/Discord later

**Implementation Notes**:
- Check for existing notification service in `src/lib/` or `src/domains/system/`
- If none exists, use Resend or SendGrid (defer to implementation)
- Recipients configured via environment variable `FEEDBACK_NOTIFICATION_EMAILS`

---

### 7. Admin UI Location

**Decision**: New page at `/admin/feedback`

**Rationale**:
- Follows existing admin pattern (if any)
- Accessible only to admin users via Clerk role check
- Separate from user-facing pages

**Implementation Notes**:
- Check existing admin routes for pattern consistency
- Use existing table components if available
- Filter controls: type, status, date range

---

## Environment Variables Required

| Variable | Purpose | Example |
|----------|---------|---------|
| `GITHUB_TOKEN` | GitHub API authentication | `ghp_xxxx...` |
| `GITHUB_REPO` | Target repository for issues | `grootdev-ai/finanseal-mvp` |
| `FEEDBACK_NOTIFICATION_EMAILS` | Team notification recipients | `team@finanseal.com,cto@finanseal.com` |

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| GitHub API rate limiting | 5000 req/hr is sufficient; implement exponential backoff |
| Screenshot capture fails | Graceful degradation; allow submission without screenshot |
| Large screenshots | Compress with canvas quality setting; limit to 2MB |
| Spam submissions | Rate limit per user (max 10/hour); require auth |
| GitHub token exposure | Server-side only; never in client bundle |

---

## Dependencies to Install

```bash
npm install html2canvas @octokit/rest
```

**No additional dev dependencies required.**
