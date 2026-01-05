"use client";

/**
 * Test Error Page for Sentry Integration Verification
 *
 * This page is for testing purposes only and should be removed before production.
 * It provides multiple ways to trigger errors for testing Sentry integration.
 *
 * @see specs/003-sentry-integration/quickstart.md for verification scenarios
 */

import * as Sentry from "@sentry/nextjs";
import { useState } from "react";

export default function TestErrorPage() {
  const [message, setMessage] = useState("");

  // Trigger an unhandled error (caught by error boundary)
  const triggerUnhandledError = () => {
    throw new Error("Test unhandled error from FinanSEAL");
  };

  // Trigger a caught error (manually reported to Sentry)
  const triggerCaughtError = () => {
    try {
      throw new Error("Test caught error from FinanSEAL");
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          testType: "caught",
          domain: "system",
        },
        extra: {
          triggeredBy: "test-error-page",
          timestamp: new Date().toISOString(),
        },
      });
      setMessage("Caught error sent to Sentry!");
    }
  };

  // Trigger a message (not an error)
  const triggerMessage = () => {
    Sentry.captureMessage("Test message from FinanSEAL", {
      level: "info",
      tags: {
        testType: "message",
        domain: "system",
      },
    });
    setMessage("Message sent to Sentry!");
  };

  // Trigger with user context
  const triggerWithUserContext = () => {
    // Set test user context
    Sentry.setUser({
      id: "test-user-123",
      // Note: email is scrubbed by beforeSend
    });

    Sentry.setContext("business", {
      id: "test-business-456",
      name: "Test Business",
    });

    try {
      throw new Error("Test error with user context");
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          testType: "with-context",
          domain: "system",
        },
      });
      setMessage("Error with user context sent to Sentry!");
    }

    // Clear test user context
    Sentry.setUser(null);
  };

  // Trigger async error
  const triggerAsyncError = async () => {
    const fakeAsyncOperation = () =>
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Test async error")), 100);
      });

    try {
      await fakeAsyncOperation();
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          testType: "async",
          domain: "system",
        },
      });
      setMessage("Async error sent to Sentry!");
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-8 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
        <h1 className="mb-2 text-xl font-bold text-yellow-600 dark:text-yellow-400">
          ⚠️ Test Error Page
        </h1>
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          This page is for testing Sentry integration only. Remove before
          production deployment (T041).
        </p>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Sentry Integration Tests</h2>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 font-medium">1. Unhandled Error</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Triggers an unhandled error caught by the error boundary.
          </p>
          <button
            onClick={triggerUnhandledError}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Trigger Unhandled Error
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 font-medium">2. Caught Error</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Triggers a caught error manually reported to Sentry.
          </p>
          <button
            onClick={triggerCaughtError}
            className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Trigger Caught Error
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 font-medium">3. Info Message</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Sends an info-level message to Sentry.
          </p>
          <button
            onClick={triggerMessage}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Send Message
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 font-medium">4. Error with User Context</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Triggers an error with user_id and business context attached.
          </p>
          <button
            onClick={triggerWithUserContext}
            className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            Trigger with Context
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 font-medium">5. Async Error</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Triggers an error from an async operation.
          </p>
          <button
            onClick={triggerAsyncError}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Trigger Async Error
          </button>
        </div>
      </div>

      {message && (
        <div className="mt-6 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <p className="text-green-700 dark:text-green-300">✓ {message}</p>
        </div>
      )}

      <div className="mt-8 text-sm text-muted-foreground">
        <p>
          <strong>Verification:</strong> After triggering errors, check the
          Sentry dashboard to confirm they appear with correct tags and context.
        </p>
      </div>
    </div>
  );
}
