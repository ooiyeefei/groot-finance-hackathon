import { Id } from "@/convex/_generated/dataModel";

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
  screenshotUrl?: string;
}

// UI display labels (non-technical, user-friendly)
export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Report a Problem",
  feature: "Suggest an Idea",
  general: "Share Feedback",
};

export const FEEDBACK_TYPE_PLACEHOLDERS: Record<FeedbackType, string> = {
  bug: "",
  feature: "",
  general: "Tell us what's on your mind...",
};

// Pre-filled text templates for bug and feature (actual text, not placeholders)
export const FEEDBACK_TYPE_TEMPLATES: Record<FeedbackType, string> = {
  bug: `What happened:


What I expected:


Steps to reproduce (optional):
`,
  feature: `I'd like to:


This would help me:
`,
  general: "",
};

// Short hints shown below the textarea
export const FEEDBACK_TYPE_HINTS: Record<FeedbackType, string> = {
  bug: "A screenshot helps us fix issues faster",
  feature: "Tell us how this would improve your workflow",
  general: "Any thoughts, suggestions, or comments welcome",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  resolved: "Resolved",
};

// Validation constants
export const MESSAGE_MIN_LENGTH = 10;
export const MESSAGE_MAX_LENGTH = 2000;
export const MAX_SCREENSHOT_SIZE = 2 * 1024 * 1024; // 2MB
