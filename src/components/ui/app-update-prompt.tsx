/**
 * App Update Prompt Components
 *
 * Two variants:
 * 1. ForceUpdatePrompt — Full-screen blocking modal (below minimum version)
 * 2. SoftUpdateBanner — Dismissible banner (below latest version)
 */

'use client';

import { useState } from 'react';
import { X, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const APP_STORE_URL = 'https://apps.apple.com/app/finanseal/id0000000000';

interface UpdatePromptProps {
  message?: string;
  currentVersion: string;
}

/**
 * Full-screen blocking modal shown when the app version is below
 * the minimum required version. Cannot be dismissed.
 */
export function ForceUpdatePrompt({ message, currentVersion }: UpdatePromptProps) {
  return (
    <div className="fixed inset-0 bg-background z-[100] flex items-center justify-center p-6">
      <Card className="bg-card border-border max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ArrowUpCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-foreground text-xl">Update Required</CardTitle>
          <CardDescription className="text-muted-foreground">
            {message || 'A critical update is required. Please update to continue using Groot Finance.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground text-center">
            Current version: {currentVersion}
          </p>
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => window.open(APP_STORE_URL, '_blank')}
          >
            Update Now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Dismissible banner shown when a newer version is available
 * but the current version is still above minimum.
 */
export function SoftUpdateBanner({ message, currentVersion }: UpdatePromptProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-primary/10 border-b border-primary/20 px-4 py-3 z-50">
      <div className="max-w-lg mx-auto flex items-center gap-3">
        <ArrowUpCircle className="h-5 w-5 text-primary flex-shrink-0" />
        <p className="text-sm text-foreground flex-1">
          {message || 'A new version of Groot Finance is available.'}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            className="h-9 px-3 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => window.open(APP_STORE_URL, '_blank')}
          >
            Update
          </Button>
        </div>
      </div>
    </div>
  );
}
