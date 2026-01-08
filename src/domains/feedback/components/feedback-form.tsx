"use client";

import { useState } from "react";
import { Bug, Lightbulb, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScreenshotButton } from "./screenshot-button";
import {
  FeedbackType,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_TYPE_PLACEHOLDERS,
  FEEDBACK_TYPE_TEMPLATES,
  FEEDBACK_TYPE_HINTS,
  MESSAGE_MIN_LENGTH,
  MESSAGE_MAX_LENGTH,
  MAX_SCREENSHOT_SIZE,
} from "../types";

interface FeedbackFormProps {
  onSubmit: (data: {
    type: FeedbackType;
    message: string;
    screenshot: File | null;
    isAnonymous: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

const TYPE_ICONS: Record<FeedbackType, typeof Bug> = {
  bug: Bug,
  feature: Lightbulb,
  general: MessageSquare,
};

/**
 * FeedbackForm - Main feedback submission form
 *
 * Allows users to select feedback type, enter message,
 * optionally attach a screenshot, and submit anonymously.
 */
// Check if message is empty or matches any template
const isTemplateOrEmpty = (msg: string): boolean => {
  const trimmed = msg.trim();
  if (!trimmed) return true;
  return Object.values(FEEDBACK_TYPE_TEMPLATES).some(
    (template) => template && trimmed === template.trim()
  );
};

export function FeedbackForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: FeedbackFormProps) {
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState(FEEDBACK_TYPE_TEMPLATES.bug);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle type change - swap template if user hasn't typed custom content
  const handleTypeChange = (newType: FeedbackType) => {
    if (isTemplateOrEmpty(message)) {
      setMessage(FEEDBACK_TYPE_TEMPLATES[newType]);
    }
    setType(newType);
  };

  // Get user's actual content (excluding template text)
  const getActualContent = (): string => {
    const template = FEEDBACK_TYPE_TEMPLATES[type];
    if (!template) return message.trim();

    // Remove template sections and get actual user input
    let content = message;
    const templateLines = template.split('\n').filter(line => line.trim());
    templateLines.forEach(line => {
      content = content.replace(line, '');
    });
    return content.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate actual content (not just template)
    const actualContent = getActualContent();
    if (actualContent.length < MESSAGE_MIN_LENGTH) {
      setError(`Please fill in the template with at least ${MESSAGE_MIN_LENGTH} characters of content`);
      return;
    }

    const trimmedMessage = message.trim();

    if (trimmedMessage.length > MESSAGE_MAX_LENGTH) {
      setError(`Message must be under ${MESSAGE_MAX_LENGTH} characters`);
      return;
    }

    // Validate screenshot size
    if (screenshot && screenshot.size > MAX_SCREENSHOT_SIZE) {
      setError("Screenshot is too large (max 2MB)");
      return;
    }

    try {
      await onSubmit({
        type,
        message: trimmedMessage,
        screenshot,
        isAnonymous,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    }
  };

  const actualContent = getActualContent();
  const characterCount = message.length;
  const isOverLimit = characterCount > MESSAGE_MAX_LENGTH;
  const isBelowMinimum = actualContent.length > 0 && actualContent.length < MESSAGE_MIN_LENGTH;
  const hasNoContent = actualContent.length === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Feedback Type Selection */}
      <div className="space-y-2">
        <Label className="text-foreground">What kind of feedback?</Label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(FEEDBACK_TYPE_LABELS) as FeedbackType[]).map(
            (feedbackType) => {
              const Icon = TYPE_ICONS[feedbackType];
              const isSelected = type === feedbackType;

              return (
                <button
                  key={feedbackType}
                  type="button"
                  onClick={() => handleTypeChange(feedbackType)}
                  disabled={isSubmitting}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">
                    {FEEDBACK_TYPE_LABELS[feedbackType]}
                  </span>
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Message Input */}
      <div className="space-y-2">
        <Label htmlFor="message" className="text-foreground">
          Your feedback
        </Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={FEEDBACK_TYPE_PLACEHOLDERS[type]}
          disabled={isSubmitting}
          className="min-h-[120px] bg-input border-border text-foreground resize-none"
        />
        <div className="flex justify-between text-xs">
          <span className={isBelowMinimum ? "text-destructive font-medium" : "text-muted-foreground"}>
            {isBelowMinimum
              ? `Please write at least ${MESSAGE_MIN_LENGTH} characters (${MESSAGE_MIN_LENGTH - message.trim().length} more needed)`
              : FEEDBACK_TYPE_HINTS[type]
            }
          </span>
          <span
            className={isOverLimit ? "text-destructive" : "text-muted-foreground"}
          >
            {characterCount}/{MESSAGE_MAX_LENGTH}
          </span>
        </div>
      </div>

      {/* Screenshot Attachment */}
      <div className="space-y-2">
        <Label className="text-foreground">Screenshot (optional)</Label>
        <ScreenshotButton
          onScreenshot={setScreenshot}
          currentScreenshot={screenshot}
          disabled={isSubmitting}
        />
        <p className="text-xs text-muted-foreground">
          Attach a screenshot to help us understand the issue better
        </p>
      </div>

      {/* Anonymous Option - Only for general feedback */}
      {type === "general" && (
        <div className="flex items-center space-x-2">
          <Checkbox
            id="anonymous"
            checked={isAnonymous}
            onCheckedChange={(checked) => setIsAnonymous(checked === true)}
            disabled={isSubmitting}
          />
          <Label
            htmlFor="anonymous"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            Submit anonymously
          </Label>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || hasNoContent || isBelowMinimum}
          className="flex-1"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            "Send Feedback"
          )}
        </Button>
      </div>
    </form>
  );
}
