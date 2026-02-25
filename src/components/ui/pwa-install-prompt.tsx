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

import { X, Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '@/lib/hooks/use-pwa-install';
import { isNativePlatform } from '@/lib/capacitor/platform';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// TODO: Replace with actual App Store URL after publishing
const APP_STORE_URL = 'https://apps.apple.com/app/groot-finance/id0000000000';

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

  // Don't show in Capacitor native shell — user already has the app installed
  if (isNativePlatform()) {
    return null;
  }

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

  // iOS: Prompt to download native app from App Store
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
            <p className="text-sm font-medium text-foreground">Get the Groot Finance App</p>
            <p className="text-xs text-muted-foreground truncate">
              Download from the App Store for the best experience
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
              onClick={() => {
                window.open(APP_STORE_URL, '_blank');
                onInstall?.();
              }}
            >
              Download
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
            <p className="text-sm font-medium text-foreground">Install Groot Finance</p>
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
