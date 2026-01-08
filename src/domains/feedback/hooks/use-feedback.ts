"use client";

import { useState, useCallback } from "react";
import { FeedbackType } from "../types";

interface SubmitFeedbackData {
  type: FeedbackType;
  message: string;
  screenshot: File | null;
  isAnonymous: boolean;
}

interface SubmitResult {
  success: boolean;
  feedbackId?: string;
  error?: string;
}

/**
 * useFeedback - Hook for feedback submission and state management
 *
 * Handles the API call to submit feedback with optional screenshot.
 * Provides loading state and error handling.
 */
export function useFeedback() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitFeedback = useCallback(
    async (data: SubmitFeedbackData): Promise<SubmitResult> => {
      setIsSubmitting(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("type", data.type);
        formData.append("message", data.message);
        formData.append("isAnonymous", String(data.isAnonymous));

        if (data.screenshot) {
          formData.append("screenshot", data.screenshot);
        }

        const response = await fetch("/api/v1/feedback", {
          method: "POST",
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          const errorMessage = result.error || "Failed to submit feedback";
          setError(errorMessage);
          return { success: false, error: errorMessage };
        }

        return { success: true, feedbackId: result.data.id };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to submit feedback";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    submitFeedback,
    isSubmitting,
    error,
    clearError,
  };
}
