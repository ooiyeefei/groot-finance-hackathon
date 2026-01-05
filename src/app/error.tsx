"use client";

/**
 * Route-Level Error Boundary for Next.js App Router
 *
 * This component catches errors that occur within route segments.
 * It provides a recovery mechanism without requiring a full page reload.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  const pathname = usePathname();

  useEffect(() => {
    // Capture the error in Sentry with route context
    Sentry.captureException(error, {
      tags: {
        errorBoundary: "route",
        domain: "unknown", // Domain can be inferred from pathname
        route: pathname,
      },
      extra: {
        digest: error.digest,
        pathname,
        componentStack: "route-error-boundary",
      },
    });
  }, [error, pathname]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mb-4 text-6xl">⚠️</div>
        <h2 className="mb-2 text-xl font-semibold text-foreground">
          Something went wrong
        </h2>
        <p className="mb-4 text-muted-foreground">
          An error occurred while loading this page. Please try again or contact
          support if the problem persists.
        </p>
        {error.digest && (
          <p className="mb-4 text-sm text-muted-foreground/70">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}
