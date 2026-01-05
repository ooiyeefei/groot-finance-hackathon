// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
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

  // Replay is disabled by default to conserve free tier quota
  // Enable if needed: replaysOnErrorSampleRate: 0.1, replaysSessionSampleRate: 0.01
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,

  // Integration options
  integrations: [
    // Browser tracing for Core Web Vitals (automatic)
    Sentry.browserTracingIntegration(),
  ],

  // PII scrubbing - removes sensitive data before sending to Sentry
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

    // Scrub request body for sensitive patterns
    if (event.request?.data && typeof event.request.data === "string") {
      // Redact common sensitive fields
      event.request.data = event.request.data
        .replace(/("password"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
        .replace(/("token"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
        .replace(/("credit_card"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
        .replace(/("ssn"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
        .replace(/("api_key"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"');
    }

    // Remove email from user context if accidentally included
    if (event.user?.email) {
      delete event.user.email;
    }

    return event;
  },

  // Session tracking is automatically enabled in @sentry/nextjs v9+
});
