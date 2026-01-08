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
  bug: "What went wrong? Tell us what happened...",
  feature: "What would make this better? Share your idea...",
  general: "Tell us what's on your mind...",
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
