"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle } from "lucide-react";

interface FuzzyMatchConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDescription: string;
  matchedDescription: string;
  confidenceScore: number;
  onConfirm: () => void;
  onReject: () => void;
}

/**
 * T023: Show low-confidence matches (<80%) for user confirmation.
 * Displays item descriptions side-by-side with confidence score.
 */
export function FuzzyMatchConfirmationDialog({
  open,
  onOpenChange,
  currentDescription,
  matchedDescription,
  confidenceScore,
  onConfirm,
  onReject,
}: FuzzyMatchConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Confirm Item Match
          </DialogTitle>
          <DialogDescription>
            The system found a potential match for this item but isn&apos;t
            confident enough to auto-link. Please confirm if these are the same
            item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Confidence:</span>
            <Badge
              variant={confidenceScore >= 60 ? "warning" : "error"}
              className="text-xs"
            >
              {confidenceScore}%
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-muted border border-border">
              <p className="text-xs text-muted-foreground mb-1">New Item</p>
              <p className="text-sm font-medium text-foreground">
                {currentDescription}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted border border-border">
              <p className="text-xs text-muted-foreground mb-1">
                Existing Item
              </p>
              <p className="text-sm font-medium text-foreground">
                {matchedDescription}
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            If confirmed, future invoices with this description will
            automatically link to the existing price history.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            onClick={onReject}
          >
            <XCircle className="w-4 h-4 mr-1.5" />
            Different Items
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={onConfirm}
          >
            <CheckCircle className="w-4 h-4 mr-1.5" />
            Same Item
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
