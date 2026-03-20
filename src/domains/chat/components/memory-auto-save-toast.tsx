/**
 * Memory Auto-Save Toast (T034)
 *
 * Dark gray toast with Yes/No buttons, 5s auto-dismiss.
 * Appears after response streaming completes when memory candidates detected.
 */

'use client';

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X } from "lucide-react";

export interface MemoryCandidateForToast {
  content: string;
  type: 'preference' | 'fact' | 'context' | 'instruction';
  confidence: number;
  reason: string;
}

interface MemoryAutoSaveToastProps {
  candidate: MemoryCandidateForToast;
  onConfirm: () => void;
  onDecline: () => void;
}

export function showMemoryAutoSaveToast(
  candidate: MemoryCandidateForToast,
  onConfirm: () => void,
  onDecline: () => void
) {
  const toastId = `memory-autosave-${Date.now()}`;

  toast.custom(
    (t) => (
      <div className="w-full max-w-md bg-zinc-800/95 backdrop-blur-sm border border-zinc-700 rounded-lg p-4 shadow-xl animate-in slide-in-from-top-2 duration-300">
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Remember this {candidate.type}?
                </span>
                <span className="text-xs text-zinc-500">
                  {Math.round(candidate.confidence * 100)}% confidence
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                toast.dismiss(toastId);
                onDecline();
              }}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Memory content */}
          <div className="bg-zinc-900/50 rounded-md p-3 border border-zinc-800">
            <p className="text-sm text-zinc-200 leading-relaxed">
              {candidate.content}
            </p>
          </div>

          {/* Reason (subtle) */}
          <p className="text-xs text-zinc-500 italic">
            {candidate.reason}
          </p>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white border-0"
              onClick={() => {
                toast.dismiss(toastId);
                onConfirm();
              }}
            >
              Yes, remember this
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 border-zinc-700"
              onClick={() => {
                toast.dismiss(toastId);
                onDecline();
              }}
            >
              No, thanks
            </Button>
          </div>
        </div>
      </div>
    ),
    {
      id: toastId,
      duration: 5000, // 5s auto-dismiss
    }
  );
}

/**
 * Show multiple memory candidates (stacked, with delay)
 */
export function showMultipleMemoryCandidates(
  candidates: MemoryCandidateForToast[],
  onConfirm: (candidate: MemoryCandidateForToast) => void,
  onDecline: (candidate: MemoryCandidateForToast) => void
) {
  candidates.forEach((candidate, index) => {
    setTimeout(() => {
      showMemoryAutoSaveToast(
        candidate,
        () => onConfirm(candidate),
        () => onDecline(candidate)
      );
    }, index * 300); // Stagger by 300ms
  });
}
