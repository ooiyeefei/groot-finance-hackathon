"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackModal } from "./feedback-modal";

/**
 * FeedbackWidget - Floating feedback button with modal
 *
 * Renders a fixed-position button in the bottom-right corner
 * that opens a feedback submission modal when clicked.
 *
 * Should only be rendered for authenticated users.
 */
export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 rounded-full h-12 w-12 p-0 shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
        aria-label="Send feedback"
      >
        <MessageCircle className="h-5 w-5" />
      </Button>

      {isOpen && <FeedbackModal onClose={() => setIsOpen(false)} />}
    </>
  );
}
