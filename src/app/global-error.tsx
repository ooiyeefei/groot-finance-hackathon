"use client";

/**
 * Global Error Boundary for Next.js App Router
 *
 * This component catches errors that occur in the root layout or during
 * initial hydration. It must include <html> and <body> tags since it
 * replaces the entire page when triggered.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling#handling-errors-in-root-layouts
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Capture the error in Sentry with additional context
    Sentry.captureException(error, {
      tags: {
        errorBoundary: "global",
        domain: "system",
      },
      extra: {
        digest: error.digest,
        componentStack: "global-error-boundary",
      },
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
            backgroundColor: "#f9fafb",
            color: "#111827",
          }}
        >
          <div
            style={{
              maxWidth: "32rem",
              textAlign: "center",
            }}
          >
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: "600",
                marginBottom: "1rem",
                color: "#dc2626",
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                marginBottom: "1.5rem",
                color: "#6b7280",
                lineHeight: "1.5",
              }}
            >
              We apologize for the inconvenience. Our team has been notified and
              is working to fix the issue.
            </p>
            {error.digest && (
              <p
                style={{
                  marginBottom: "1.5rem",
                  fontSize: "0.875rem",
                  color: "#9ca3af",
                }}
              >
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                backgroundColor: "#2563eb",
                color: "white",
                padding: "0.75rem 1.5rem",
                borderRadius: "0.375rem",
                border: "none",
                cursor: "pointer",
                fontSize: "1rem",
                fontWeight: "500",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
