/**
 * PWA Install Prompt Component
 * Task T033-T034: Install prompt for Android/Chrome and iOS instructions
 *
 * Features:
 * - Android/Chrome: Native install prompt trigger
 * - iOS: Manual installation instructions modal
 * - Responsive design with 44x44px touch targets
 * - Semantic tokens for theming
 */

'use client';

import { X, Download, Share, Plus, Smartphone } from 'lucide-react';
import { usePWAInstall } from '@/lib/hooks/use-pwa-install';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// Props interface (from specs/001-mobile-pwa/contracts/pwa-hooks.ts)
export interface PWAInstallPromptProps {
  /** Callback when user installs the PWA */
  onInstall?: () => void;
  /** Callback when user dismisses the prompt */
  onDismiss?: () => void;
  /** Custom class name */
  className?: string;
}

export function PWAInstallPrompt({
  onInstall,
  onDismiss,
  className = '',
}: PWAInstallPromptProps) {
  const {
    isInstalled,
    isInstallable,
    isPromptShowing,
    hasUserDismissed,
    isIOS,
    isMobile,
    shouldShowIOSInstructions,
    promptInstall,
    dismissPrompt,
    showIOSInstructions,
    hideIOSInstructions,
  } = usePWAInstall();

  // Don't show if already installed, dismissed, OR not on mobile
  if (isInstalled || hasUserDismissed || !isMobile) {
    return null;
  }

  // Handle Android/Chrome install
  const handleInstall = async () => {
    await promptInstall();
    onInstall?.();
  };

  // Handle dismiss
  const handleDismiss = () => {
    dismissPrompt();
    onDismiss?.();
  };

  // iOS Installation Instructions Modal
  if (isIOS && shouldShowIOSInstructions) {
    return (
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 ${className}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            hideIOSInstructions();
            handleDismiss();
          }
        }}
      >
        <Card className="bg-card border-border max-w-md w-full">
          <CardHeader className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-4 top-4 h-11 w-11"
              onClick={() => {
                hideIOSInstructions();
                handleDismiss();
              }}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3 pr-12">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-foreground">Add to Home Screen</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Install FinanSEAL for quick access
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Follow these steps to add FinanSEAL to your home screen:
            </p>

            <ol className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-sm">
                  1
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-sm text-foreground">
                    Tap the <Share className="inline h-4 w-4 mx-1" /> Share button in Safari&apos;s toolbar
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-sm">
                  2
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-sm text-foreground">
                    Scroll down and tap <Plus className="inline h-4 w-4 mx-1" /> <strong>Add to Home Screen</strong>
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-sm">
                  3
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-sm text-foreground">
                    Tap <strong>Add</strong> to confirm
                  </p>
                </div>
              </li>
            </ol>

            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full h-11"
                onClick={() => {
                  hideIOSInstructions();
                  handleDismiss();
                }}
              >
                Got it
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show iOS prompt trigger (banner at bottom)
  if (isIOS) {
    return (
      <div
        className={`fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-40 ${className}`}
        data-testid="pwa-install-prompt"
      >
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex-shrink-0 flex items-center justify-center">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Install FinanSEAL</p>
            <p className="text-xs text-muted-foreground truncate">
              Add to your home screen for quick access
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-11"
              onClick={handleDismiss}
              aria-label="Dismiss"
            >
              <X className="h-5 w-5" />
            </Button>
            <Button
              size="sm"
              className="h-11 px-4"
              onClick={showIOSInstructions}
            >
              Install
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Android/Chrome install prompt
  if (isInstallable) {
    return (
      <div
        className={`fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-40 ${className}`}
        data-testid="pwa-install-prompt"
      >
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex-shrink-0 flex items-center justify-center">
            <Download className="h-6 w-6 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Install FinanSEAL</p>
            <p className="text-xs text-muted-foreground truncate">
              Add to your home screen for quick access
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-11 w-11"
              onClick={handleDismiss}
              aria-label="Dismiss"
              disabled={isPromptShowing}
            >
              <X className="h-5 w-5" />
            </Button>
            <Button
              size="sm"
              className="h-11 px-4"
              onClick={handleInstall}
              disabled={isPromptShowing}
            >
              {isPromptShowing ? 'Installing...' : 'Install'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Not installable and not iOS - don't show anything
  return null;
}

export default PWAInstallPrompt;
