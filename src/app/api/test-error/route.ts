/**
 * Test Error Endpoint
 *
 * Throws an error to trigger Sentry webhook and verify
 * Discord/Telegram notifications are working.
 *
 * Requires X-Test-Token header matching TEST_ERROR_SECRET env var.
 *
 * @example
 * curl -H "X-Test-Token: your-secret" https://finance.hellogroot.com/api/test-error
 */

import { NextRequest } from "next/server";
import { setDomainTag, setBusinessContext } from "@/domains/system/lib/sentry";

export async function GET(request: NextRequest): Promise<never> {
  // Verify test token
  const testToken = request.headers.get("X-Test-Token");
  const expectedToken = process.env.TEST_ERROR_SECRET;

  if (expectedToken && testToken !== expectedToken) {
    throw new Error("Unauthorized: Invalid test token");
  }

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
