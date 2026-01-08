"use client";

import { useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackForm } from "./feedback-form";
import { FeedbackType } from "../types";

interface FeedbackModalProps {
  onClose: () => void;
}

type ModalState = "form" | "success";

/**
 * FeedbackModal - Container modal for feedback submission
 *
 * Handles the full feedback flow:
 * 1. Form submission
 * 2. API call
 * 3. Success confirmation
 * 4. Auto-close after success
 */
export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [state, setState] = useState<ModalState>("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedType, setSubmittedType] = useState<FeedbackType | null>(null);

  const handleSubmit = async (data: {
    type: FeedbackType;
    message: string;
    screenshot: File | null;
    isAnonymous: boolean;
  }) => {
    setIsSubmitting(true);

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
        throw new Error(result.error || "Failed to submit feedback");
      }

      setSubmittedType(data.type);
      setState("success");

      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose();
      }, 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSuccessMessage = () => {
    switch (submittedType) {
      case "bug":
        return "We've logged this issue and will investigate. A GitHub issue has been created for tracking.";
      case "feature":
        return "Great idea! We've added it to our feature requests. A GitHub issue has been created for tracking.";
      case "general":
        return "Thanks for your feedback! We appreciate you taking the time to share your thoughts.";
      default:
        return "Thanks for your feedback!";
    }
  };

  return (
    <div
      data-feedback-ui
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      style={{
        margin: 0,
        padding: 0,
        width: "100vw",
        height: "100vh",
        position: "fixed",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        data-feedback-ui
        className="bg-card rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden border border-border m-4 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {state === "form" ? "Send Feedback" : "Thank You!"}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-64px)]">
          {state === "form" ? (
            <FeedbackForm
              onSubmit={handleSubmit}
              onCancel={onClose}
              isSubmitting={isSubmitting}
            />
          ) : (
            <div className="text-center py-8 space-y-4">
              <div className="flex justify-center">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-medium text-foreground">
                  Feedback Received!
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {getSuccessMessage()}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                This window will close automatically...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
