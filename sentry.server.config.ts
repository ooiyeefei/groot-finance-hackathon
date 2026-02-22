// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send events in production — prevents dev server noise from polluting Sentry
  enabled: process.env.NODE_ENV === "production",

  // Environment detection
  environment: process.env.NODE_ENV,

  // 10% sampling in production
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Spotlight is disabled in production
  spotlight: process.env.NODE_ENV === "development",

  // PII scrubbing for server-side events
  // FR-005: System MUST automatically redact sensitive data
  beforeSend(event) {
    // Defense in depth: strip absolute local paths from error messages
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.value) {
          ex.value = ex.value.replace(/\/home\/[^\s'"]*/g, "[path-redacted]");
        }
      }
    }

    // Scrub Authorization headers
    if (event.request?.headers) {
      const headers = event.request.headers as Record<string, string>;
      if (headers.authorization) {
        headers.authorization = "[REDACTED]";
      }
      if (headers.cookie) {
        headers.cookie = "[REDACTED]";
      }
      // Remove any header containing 'token' or 'key' in the name
      Object.keys(headers).forEach((key) => {
        if (key.toLowerCase().includes("token") || key.toLowerCase().includes("key")) {
          headers[key] = "[REDACTED]";
        }
      });
    }

    // Remove email from user context if accidentally included
    if (event.user?.email) {
      delete event.user.email;
    }

    return event;
  },
});
