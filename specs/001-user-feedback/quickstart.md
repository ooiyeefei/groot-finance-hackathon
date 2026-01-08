# Quickstart: User Feedback Collection

**Feature**: 001-user-feedback
**Date**: 2026-01-07

## Prerequisites

- Node.js 18+
- npm or pnpm
- Convex project configured
- GitHub repository with issue labels (`bug`, `feature-request`)

## Environment Setup

Add to `.env.local`:

```bash
# GitHub Integration (required for issue creation)
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_REPO=grootdev-ai/finanseal-mvp

# Team Notifications (optional)
FEEDBACK_NOTIFICATION_EMAILS=team@finanseal.com
```

## Installation

```bash
# Install new dependencies
npm install html2canvas @octokit/rest
```

## File Structure Overview

```
src/domains/feedback/           # New domain
├── components/
│   ├── feedback-widget.tsx     # Main floating widget
│   ├── feedback-form.tsx       # Form with type selection
│   ├── feedback-confirmation.tsx
│   └── screenshot-button.tsx
├── hooks/
│   └── use-feedback.ts
├── services/
│   └── github-integration.ts
└── types/
    └── feedback.ts

convex/
├── feedback.ts                 # New file
└── schema.ts                   # Add feedback table

src/app/api/v1/feedback/        # New routes
├── route.ts
└── github/route.ts

src/app/(dashboard)/admin/feedback/
└── page.tsx                    # Admin view
```

## Quick Implementation Steps

### 1. Add Convex Schema

```typescript
// convex/schema.ts - add to existing defineSchema
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
})
  .index("by_status", ["status"])
  .index("by_type", ["type"])
  .index("by_business", ["businessId"]),
```

### 2. Create Feedback Widget

```typescript
// src/domains/feedback/components/feedback-widget.tsx
"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackModal } from "./feedback-modal";

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 rounded-full p-3 shadow-lg"
        aria-label="Send feedback"
      >
        <MessageCircle className="h-5 w-5" />
      </Button>
      {isOpen && <FeedbackModal onClose={() => setIsOpen(false)} />}
    </>
  );
}
```

### 3. Add Widget to Layout

```typescript
// src/app/(dashboard)/layout.tsx - add inside authenticated section
import { FeedbackWidget } from "@/domains/feedback/components/feedback-widget";

// Inside the layout component, after main content:
<FeedbackWidget />
```

### 4. Create API Route

```typescript
// src/app/api/v1/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const type = formData.get("type") as string;
  const message = formData.get("message") as string;
  const isAnonymous = formData.get("isAnonymous") === "true";
  const screenshot = formData.get("screenshot") as File | null;

  // Validate
  if (!message || message.length < 10) {
    return NextResponse.json(
      { error: "Please tell us a bit more so we can help you" },
      { status: 400 }
    );
  }

  // Upload screenshot if provided
  let screenshotStorageId = null;
  if (screenshot) {
    // Upload to Convex storage
    const uploadUrl = await convex.mutation(api.feedback.generateUploadUrl);
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: screenshot,
    });
    const { storageId } = await uploadResponse.json();
    screenshotStorageId = storageId;
  }

  // Create feedback
  const feedbackId = await convex.mutation(api.feedback.create, {
    type,
    message,
    screenshotStorageId,
    pageUrl: request.headers.get("referer") || "",
    userAgent: request.headers.get("user-agent") || "",
    userId: isAnonymous ? undefined : userId,
    isAnonymous,
  });

  // Trigger GitHub issue creation for bugs/features
  if (type !== "general") {
    // Fire-and-forget
    fetch(`${request.nextUrl.origin}/api/v1/feedback/github`, {
      method: "POST",
      body: JSON.stringify({ feedbackId }),
      headers: { "Content-Type": "application/json" },
    });
  }

  return NextResponse.json({ id: feedbackId }, { status: 201 });
}
```

## Testing

### Manual Test

1. Log in to the app
2. Click feedback button (bottom-right)
3. Select "Report a Problem"
4. Enter: "The dashboard is loading slowly"
5. Click screenshot button
6. Submit
7. Verify:
   - Confirmation message appears
   - Check Convex dashboard for new feedback record
   - Check GitHub repo for new issue with `bug` label

### E2E Test Scaffold

```typescript
// tests/e2e/feedback-submission.spec.ts
import { test, expect } from "@playwright/test";

test("user can submit bug report", async ({ page }) => {
  await page.goto("/dashboard");

  // Click feedback button
  await page.click('[aria-label="Send feedback"]');

  // Select bug report
  await page.click('text=Report a Problem');

  // Enter message
  await page.fill('textarea', 'Test bug report from E2E');

  // Submit
  await page.click('text=Send');

  // Verify confirmation
  await expect(page.locator('text=Thank you')).toBeVisible();
});
```

## Common Issues

### GitHub Issue Not Created

1. Check `GITHUB_TOKEN` has `repo` scope
2. Verify `GITHUB_REPO` format is `owner/repo`
3. Check GitHub API rate limits
4. Look at API route logs for errors

### Screenshot Capture Fails

1. Ensure `html2canvas` is client-side only
2. Check for CORS issues with images
3. Verify image is under 2MB limit

### Widget Not Visible

1. Confirm user is authenticated
2. Check z-index conflicts
3. Verify component is in correct layout file
