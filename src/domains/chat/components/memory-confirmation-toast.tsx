/**
 * Memory Confirmation Toast (T027)
 *
 * Dark gray toast UI for handling memory contradictions.
 * User chooses: replace old, keep both, or cancel.
 */

'use client';

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface MemoryConflict {
  topic: string;
  existingMemory: {
    id: string;
    content: string;
    createdAt: number;
  };
  newMemory: {
    content: string;
  };
  options: Array<{
    action: "replace" | "keep_both" | "cancel";
    label: string;
  }>;
}

interface MemoryConfirmationToastProps {
  conflict: MemoryConflict;
  onResolve: (action: "replace" | "keep_both" | "cancel") => void;
}

export function showMemoryConfirmationToast(
  conflict: MemoryConflict,
  onResolve: (action: "replace" | "keep_both" | "cancel") => void
) {
  const toastId = `memory-conflict-${Date.now()}`;

  toast.custom(
    (t) => (
      <div className="w-full max-w-md bg-zinc-800 border border-zinc-700 rounded-lg p-4 shadow-lg">
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-medium text-zinc-100">
                Memory Conflict Detected
              </h4>
              <p className="text-xs text-zinc-400 mt-1">
                Topic: {conflict.topic.replace(/_/g, " ")}
              </p>
            </div>
          </div>

          {/* Existing memory */}
          <div className="bg-zinc-900 rounded p-3">
            <p className="text-xs text-zinc-500 mb-1">Existing:</p>
            <p className="text-sm text-zinc-300">{conflict.existingMemory.content}</p>
          </div>

          {/* New memory */}
          <div className="bg-zinc-900 rounded p-3">
            <p className="text-xs text-zinc-500 mb-1">New:</p>
            <p className="text-sm text-zinc-300">{conflict.newMemory.content}</p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 mt-2">
            {conflict.options.map((option) => (
              <Button
                key={option.action}
                variant={option.action === "cancel" ? "outline" : "default"}
                size="sm"
                className={
                  option.action === "replace"
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : option.action === "keep_both"
                    ? "bg-zinc-700 hover:bg-zinc-600 text-white"
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-600"
                }
                onClick={() => {
                  toast.dismiss(toastId);
                  onResolve(option.action);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      id: toastId,
      duration: Infinity, // Manual dismiss
    }
  );
}
