/**
 * Test Error Endpoint
 *
 * Throws an error to trigger Sentry webhook and verify
 * Discord/Telegram notifications are working.
 *
 * @example
 * curl http://localhost:3001/api/test-error
 */

import { setDomainTag, setBusinessContext } from "@/domains/system/lib/sentry";

export async function GET(): Promise<never> {
  // Set context for the error
  setDomainTag("system");
  setBusinessContext({
    id: "test-business-123",
    name: "Test Business",
    role: "admin",
  });

  // Throw a test error
  throw new Error(
    "TestError: This is a test error to verify Sentry → Discord webhook integration"
  );
}
