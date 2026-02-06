'use client';

/**
 * Delete Template Dialog Component
 *
 * Confirmation dialog for deleting custom export templates.
 */

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DeleteTemplateDialogProps {
  templateName: string;
  isOpen: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteTemplateDialog({
  templateName,
  isOpen,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteTemplateDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onCancel();
        }
      }}
    >
      <div className="bg-card rounded-lg w-full max-w-md border border-border shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Delete Template</h2>
            <p className="text-sm text-muted-foreground">This action cannot be undone</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-foreground">
            Are you sure you want to delete the template{' '}
            <span className="font-semibold">&quot;{templateName}&quot;</span>?
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            All saved configuration and field mappings will be permanently removed.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Template'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
