"use client";

import { useState, useCallback, useRef } from "react";
import { ImagePlus, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScreenshotButtonProps {
  onScreenshot: (file: File | null) => void;
  currentScreenshot: File | null;
  disabled?: boolean;
}

/**
 * ScreenshotButton - Upload screenshot/image attachment
 *
 * Users can upload images (screenshots taken with OS tools or other images)
 * to help illustrate their feedback.
 */
export function ScreenshotButton({
  onScreenshot,
  currentScreenshot,
  disabled = false,
}: ScreenshotButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setError("Image must be under 2MB");
        return;
      }

      setError(null);
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
    setError(null);
  }, [onScreenshot]);

  // Show attached image
  if (currentScreenshot) {
    return (
      <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
        <ImagePlus className="h-4 w-4 text-muted-foreground" />
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
      {error && (
        <div className="flex items-center gap-2 p-2 bg-destructive/10 text-destructive rounded-md text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={triggerFileUpload}
        disabled={disabled}
        className="w-full"
      >
        <ImagePlus className="h-4 w-4 mr-2" />
        Add Image
      </Button>

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
