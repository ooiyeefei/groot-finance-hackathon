// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment detection
  environment: process.env.NODE_ENV,

  // Adjust this value in production, or use tracesSampler for greater control
  // 10% sampling in production, 100% in development (per spec)
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Spotlight is disabled in production
  spotlight: process.env.NODE_ENV === "development",

  // PII scrubbing for server-side events
  // FR-005: System MUST automatically redact sensitive data
  beforeSend(event) {
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
