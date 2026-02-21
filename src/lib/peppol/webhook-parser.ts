/**
 * Storecove Webhook Parser
 *
 * Parses incoming Storecove webhook payloads into typed events
 * for status updates on Peppol document submissions.
 */

import type {
  StorecoveWebhookPayload,
  StorecoveWebhookBody,
  StorecoveWebhookEvent,
} from "./types"

/**
 * Parse a raw Storecove webhook payload into a typed event.
 *
 * Storecove webhooks arrive as:
 * { guid: "webhook-guid", body: "{\"guid\":\"submission-guid\",\"status\":\"delivered\"}" }
 *
 * The `body` field is a stringified JSON object that needs to be parsed.
 */
export function parseWebhookEvent(
  rawBody: string
): StorecoveWebhookEvent {
  let payload: StorecoveWebhookPayload
  try {
    payload = JSON.parse(rawBody) as StorecoveWebhookPayload
  } catch {
    throw new Error("Invalid webhook payload: not valid JSON")
  }

  if (!payload.body) {
    throw new Error("Invalid webhook payload: missing body field")
  }

  let body: StorecoveWebhookBody
  try {
    body =
      typeof payload.body === "string"
        ? (JSON.parse(payload.body) as StorecoveWebhookBody)
        : (payload.body as unknown as StorecoveWebhookBody)
  } catch {
    throw new Error("Invalid webhook payload: body is not valid JSON")
  }

  if (!body.guid) {
    throw new Error("Invalid webhook payload: missing submission GUID")
  }

  if (!body.status) {
    throw new Error("Invalid webhook payload: missing status")
  }

  const validStatuses = ["transmitted", "delivered", "failed"] as const
  if (!validStatuses.includes(body.status as (typeof validStatuses)[number])) {
    throw new Error(`Invalid webhook payload: unknown status "${body.status}"`)
  }

  return {
    submissionGuid: body.guid,
    eventType: body.status as StorecoveWebhookEvent["eventType"],
    timestamp: body.timestamp ? new Date(body.timestamp).getTime() : Date.now(),
    errors: body.errors,
  }
}

/**
 * Verify webhook secret header matches expected value.
 */
export function verifyWebhookSecret(
  headerValue: string | null,
  expectedSecret: string
): boolean {
  if (!headerValue || !expectedSecret) return false
  return headerValue === expectedSecret
}
