// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
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

  // PII scrubbing for edge events
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
    }

    // Remove email from user context if accidentally included
    if (event.user?.email) {
      delete event.user.email;
    }

    return event;
  },
});
