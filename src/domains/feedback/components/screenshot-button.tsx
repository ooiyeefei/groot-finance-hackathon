"use client";

import { useState, useCallback, useRef } from "react";
import { Camera, Upload, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import html2canvas from "html2canvas";

interface ScreenshotButtonProps {
  onScreenshot: (file: File | null) => void;
  currentScreenshot: File | null;
  disabled?: boolean;
}

/**
 * ScreenshotButton - Captures screenshot or allows file upload
 *
 * Provides two options:
 * 1. Capture current page screenshot using html2canvas
 * 2. Upload an image file from device
 */
export function ScreenshotButton({
  onScreenshot,
  currentScreenshot,
  disabled = false,
}: ScreenshotButtonProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const captureScreenshot = useCallback(async () => {
    setIsCapturing(true);
    setCaptureError(null);

    try {
      // Hide any feedback UI elements during capture
      const feedbackElements = document.querySelectorAll("[data-feedback-ui]");
      feedbackElements.forEach((el) => {
        (el as HTMLElement).style.visibility = "hidden";
      });

      // Capture the page with error-tolerant settings
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: 1,
        ignoreElements: (element) => {
          return element.hasAttribute("data-feedback-ui");
        },
        // Skip elements that cause parsing errors
        onclone: (clonedDoc) => {
          // Remove problematic CSS that html2canvas can't parse
          const styleSheets = clonedDoc.styleSheets;
          for (let i = 0; i < styleSheets.length; i++) {
            try {
              const rules = styleSheets[i].cssRules;
              if (rules) {
                // Access rules to check for errors (will throw if cross-origin)
              }
            } catch {
              // Ignore cross-origin stylesheets
            }
          }
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
      setCaptureError("Screenshot failed. Please upload an image instead.");
      // Restore feedback UI visibility on error
      const feedbackElements = document.querySelectorAll("[data-feedback-ui]");
      feedbackElements.forEach((el) => {
        (el as HTMLElement).style.visibility = "visible";
      });
    } finally {
      setIsCapturing(false);
    }
  }, [onScreenshot]);

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith("image/")) {
        setCaptureError("Please select an image file");
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setCaptureError("Image must be under 2MB");
        return;
      }

      setCaptureError(null);
      onScreenshot(file);

      // Reset input for re-selection
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onScreenshot]
  );

  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const removeScreenshot = useCallback(() => {
    onScreenshot(null);
    setCaptureError(null);
  }, [onScreenshot]);

  // Show attached image
  if (currentScreenshot) {
    return (
      <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
        <Camera className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-foreground flex-1 truncate">
          {currentScreenshot.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {(currentScreenshot.size / 1024).toFixed(0)} KB
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
    <div className="space-y-2">
      {/* Error message */}
      {captureError && (
        <div className="flex items-center gap-2 p-2 bg-destructive/10 text-destructive rounded-md text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{captureError}</span>
        </div>
      )}

      {/* Two button options */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={captureScreenshot}
          disabled={disabled || isCapturing}
          className="flex-1"
        >
          {isCapturing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Capturing...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4 mr-2" />
              Screenshot
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={triggerFileUpload}
          disabled={disabled || isCapturing}
          className="flex-1"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Image
        </Button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}
