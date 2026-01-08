"use client";

import { useAuth } from "@clerk/nextjs";
import { FeedbackWidget } from "./feedback-widget";

/**
 * FeedbackWidgetWrapper - Conditionally renders feedback widget for authenticated users
 *
 * Only shows the floating feedback button when a user is signed in.
 * This prevents unauthenticated API calls and provides better UX.
 */
export function FeedbackWidgetWrapper() {
  const { isSignedIn, isLoaded } = useAuth();

  // Don't render until auth state is loaded
  if (!isLoaded) {
    return null;
  }

  // Only show widget for authenticated users
  if (!isSignedIn) {
    return null;
  }

  return <FeedbackWidget />;
}
