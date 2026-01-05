"use client";

/**
 * Sentry User Context Provider
 *
 * Automatically syncs Clerk authentication and business context
 * to Sentry for enhanced error tracking.
 *
 * @see specs/003-sentry-integration/research.md for design decisions
 */

import { useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useBusinessContext } from "@/contexts/business-context";
import {
  setUserContext,
  setBusinessContext,
  clearContext,
} from "@/domains/system/lib/sentry";

/**
 * SentryUserProvider - Sets Sentry user and business context
 *
 * This component should be placed inside ClerkProvider and BusinessContextProvider
 * to automatically sync authentication state with Sentry.
 *
 * Context flows:
 * - Clerk userId → Sentry.setUser({ id })
 * - BusinessContext → Sentry.setContext("business", {...})
 *
 * This enables:
 * - Filtering errors by user in Sentry dashboard
 * - Filtering errors by business (multi-tenant)
 * - User impact analysis in Sentry
 */
export function SentryUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const businessContext = useBusinessContext();

  // Sync Clerk user to Sentry
  useEffect(() => {
    if (!isAuthLoaded) return;

    if (isSignedIn && userId) {
      setUserContext({
        id: userId,
        username: user?.username || user?.firstName || undefined,
      });
    } else {
      // User logged out or not authenticated
      clearContext();
    }
  }, [isAuthLoaded, isSignedIn, userId, user?.username, user?.firstName]);

  // Sync business context to Sentry
  useEffect(() => {
    if (!businessContext) return;

    const { activeContext, profile } = businessContext;

    if (activeContext?.businessId) {
      setBusinessContext({
        id: activeContext.businessId,
        name: profile?.name,
        role: activeContext.role,
      });
    }
  }, [
    businessContext?.activeContext?.businessId,
    businessContext?.activeContext?.role,
    businessContext?.profile?.name,
  ]);

  return <>{children}</>;
}
