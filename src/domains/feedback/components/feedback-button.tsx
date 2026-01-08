"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { FeedbackModal } from "./feedback-modal";

/**
 * FeedbackIcon - Custom feedback icon from provided SVG
 */
function FeedbackIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      className={className}
    >
      <path
        fill="currentColor"
        d="M2 22V4q0-.825.588-1.412T4 2h16q.825 0 1.413.588T22 4v12q0 .825-.587 1.413T20 18H6zm10-7q.425 0 .713-.288T13 14t-.288-.712T12 13t-.712.288T11 14t.288.713T12 15m-1-4h2V5h-2z"
      />
    </svg>
  );
}

/**
 * FeedbackButton - Header-friendly feedback button with modal
 *
 * Designed to be placed in the header next to ThemeToggle.
 * Opens a feedback submission modal when clicked.
 *
 * Should only be rendered for authenticated users.
 */
export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setIsOpen(true)}
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="Send feedback"
              data-feedback-ui
            >
              <FeedbackIcon className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Send feedback</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isOpen && <FeedbackModal onClose={() => setIsOpen(false)} />}
    </>
  );
}
