# Data Model: User Feedback Collection

**Feature**: 001-user-feedback
**Date**: 2026-01-07

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FEEDBACK                                 │
├─────────────────────────────────────────────────────────────────┤
│ _id: Id<"feedback">                    (PK)                     │
│ type: "bug" | "feature" | "general"                             │
│ message: string                        (required, max 2000)     │
│ screenshotStorageId: Id<"_storage">?   (optional)               │
│ pageUrl: string                        (captured automatically) │
│ userAgent: string                      (captured automatically) │
│ userId: Id<"users">?                   (null if anonymous)      │
│ businessId: Id<"businesses">?          (for multi-tenant)       │
│ isAnonymous: boolean                   (default: false)         │
│ status: "new" | "reviewed" | "resolved"(default: "new")         │
│ githubIssueUrl: string?                (populated async)        │
│ githubIssueNumber: number?             (populated async)        │
│ _creationTime: number                  (Convex auto-generated)  │
└─────────────────────────────────────────────────────────────────┘
           │                    │
           │ 0..1               │ 0..1
           ▼                    ▼
┌──────────────────┐   ┌──────────────────┐
│      USERS       │   │    BUSINESSES    │
│  (existing)      │   │    (existing)    │
└──────────────────┘   └──────────────────┘
```

## Convex Schema Definition

```typescript
// convex/schema.ts (add to existing schema)

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Add this table to the existing schema
feedback: defineTable({
  // Core fields
  type: v.union(
    v.literal("bug"),
    v.literal("feature"),
    v.literal("general")
  ),
  message: v.string(),

  // Screenshot (optional)
  screenshotStorageId: v.optional(v.id("_storage")),

  // Context (auto-captured)
  pageUrl: v.string(),
  userAgent: v.string(),

  // User association
  userId: v.optional(v.id("users")),
  businessId: v.optional(v.id("businesses")),
  isAnonymous: v.boolean(),

  // Status tracking
  status: v.union(
    v.literal("new"),
    v.literal("reviewed"),
    v.literal("resolved")
  ),

  // GitHub integration
  githubIssueUrl: v.optional(v.string()),
  githubIssueNumber: v.optional(v.number()),
})
  .index("by_status", ["status"])
  .index("by_type", ["type"])
  .index("by_business", ["businessId"])
  .index("by_user", ["userId"])
  .index("by_creation", ["_creationTime"]),
```

## Field Specifications

### Required Fields

| Field | Type | Validation | Description |
|-------|------|------------|-------------|
| `type` | enum | `bug` \| `feature` \| `general` | Feedback category |
| `message` | string | 1-2000 characters | User's feedback text |
| `pageUrl` | string | Valid URL | Page where feedback was submitted |
| `userAgent` | string | Non-empty | Browser/device info |
| `isAnonymous` | boolean | - | Whether user chose anonymous submission |
| `status` | enum | `new` \| `reviewed` \| `resolved` | Admin triage status |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `screenshotStorageId` | Id<"_storage"> | null | Reference to uploaded screenshot |
| `userId` | Id<"users"> | null | Submitting user (null if anonymous) |
| `businessId` | Id<"businesses"> | null | Business context for multi-tenant |
| `githubIssueUrl` | string | null | URL of created GitHub issue |
| `githubIssueNumber` | number | null | GitHub issue number |

## State Transitions

```
┌───────────┐
│           │
│    NEW    │ ◄── Initial state on creation
│           │
└─────┬─────┘
      │
      │ Admin reviews
      ▼
┌───────────┐
│           │
│ REVIEWED  │ ◄── Admin has seen and triaged
│           │
└─────┬─────┘
      │
      │ Issue resolved / feedback addressed
      ▼
┌───────────┐
│           │
│ RESOLVED  │ ◄── Final state
│           │
└───────────┘
```

**Transition Rules**:
- `new` → `reviewed`: Admin views and triages feedback
- `reviewed` → `resolved`: Issue is fixed or feedback is addressed
- `new` → `resolved`: Direct resolution (e.g., duplicate)
- No backward transitions (status only moves forward)

## Indexes

| Index Name | Fields | Purpose |
|------------|--------|---------|
| `by_status` | `status` | Filter by triage status |
| `by_type` | `type` | Filter by feedback type |
| `by_business` | `businessId` | Multi-tenant filtering |
| `by_user` | `userId` | User's feedback history |
| `by_creation` | `_creationTime` | Sort by newest/oldest |

## TypeScript Interfaces

```typescript
// src/domains/feedback/types/feedback.ts

import { Id } from "convex/_generated/dataModel";

export type FeedbackType = "bug" | "feature" | "general";
export type FeedbackStatus = "new" | "reviewed" | "resolved";

export interface Feedback {
  _id: Id<"feedback">;
  _creationTime: number;
  type: FeedbackType;
  message: string;
  screenshotStorageId?: Id<"_storage">;
  pageUrl: string;
  userAgent: string;
  userId?: Id<"users">;
  businessId?: Id<"businesses">;
  isAnonymous: boolean;
  status: FeedbackStatus;
  githubIssueUrl?: string;
  githubIssueNumber?: number;
}

export interface FeedbackSubmission {
  type: FeedbackType;
  message: string;
  screenshot?: Blob;
  isAnonymous: boolean;
}

export interface FeedbackWithUser extends Feedback {
  user?: {
    name: string;
    email: string;
  };
}

// UI display labels (non-technical)
export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Report a Problem",
  feature: "Suggest an Idea",
  general: "Share Feedback",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  resolved: "Resolved",
};
```

## Validation Rules

### Message Validation
```typescript
const MESSAGE_MIN_LENGTH = 10;
const MESSAGE_MAX_LENGTH = 2000;

function validateMessage(message: string): { valid: boolean; error?: string } {
  const trimmed = message.trim();
  if (trimmed.length < MESSAGE_MIN_LENGTH) {
    return { valid: false, error: "Please tell us a bit more so we can help you" };
  }
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    return { valid: false, error: `Message must be under ${MESSAGE_MAX_LENGTH} characters` };
  }
  return { valid: true };
}
```

### Screenshot Validation
```typescript
const MAX_SCREENSHOT_SIZE = 2 * 1024 * 1024; // 2MB

function validateScreenshot(blob: Blob): { valid: boolean; error?: string } {
  if (blob.size > MAX_SCREENSHOT_SIZE) {
    return { valid: false, error: "Screenshot is too large" };
  }
  if (!blob.type.startsWith("image/")) {
    return { valid: false, error: "Invalid image format" };
  }
  return { valid: true };
}
```

## Data Retention

- Feedback records: Retained indefinitely (audit trail)
- Screenshots: Retained with feedback record
- No automatic deletion policy for Phase 1
- Future: Consider archival after 2 years for resolved feedback
