"use client";

import { useState, useCallback } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import html2canvas from "html2canvas";

interface ScreenshotButtonProps {
  onScreenshot: (file: File | null) => void;
  currentScreenshot: File | null;
  disabled?: boolean;
}

/**
 * ScreenshotButton - Captures current page screenshot using html2canvas
 *
 * Captures the visible viewport and converts it to a File object
 * for upload with the feedback submission.
 */
export function ScreenshotButton({
  onScreenshot,
  currentScreenshot,
  disabled = false,
}: ScreenshotButtonProps) {
  const [isCapturing, setIsCapturing] = useState(false);

  const captureScreenshot = useCallback(async () => {
    setIsCapturing(true);

    try {
      // Hide any feedback UI elements during capture
      const feedbackElements = document.querySelectorAll("[data-feedback-ui]");
      feedbackElements.forEach((el) => {
        (el as HTMLElement).style.visibility = "hidden";
      });

      // Capture the page
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: 1, // Keep original scale for reasonable file size
        ignoreElements: (element) => {
          return element.hasAttribute("data-feedback-ui");
        },
      });

      // Restore feedback UI visibility
      feedbackElements.forEach((el) => {
        (el as HTMLElement).style.visibility = "visible";
      });

      // Convert canvas to blob then to File
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create screenshot blob"));
            }
          },
          "image/png",
          0.9
        );
      });

      const file = new File([blob], `screenshot-${Date.now()}.png`, {
        type: "image/png",
      });

      onScreenshot(file);
    } catch (error) {
      console.error("[Screenshot] Capture failed:", error);
    } finally {
      setIsCapturing(false);
    }
  }, [onScreenshot]);

  const removeScreenshot = useCallback(() => {
    onScreenshot(null);
  }, [onScreenshot]);

  if (currentScreenshot) {
    return (
      <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
        <Camera className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-foreground flex-1 truncate">
          {currentScreenshot.name}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={removeScreenshot}
          disabled={disabled}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={captureScreenshot}
      disabled={disabled || isCapturing}
      className="w-full"
    >
      {isCapturing ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Capturing...
        </>
      ) : (
        <>
          <Camera className="h-4 w-4 mr-2" />
          Attach Screenshot
        </>
      )}
    </Button>
  );
}
