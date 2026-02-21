/**
 * POST /api/v1/peppol/webhook
 *
 * Receive Storecove webhook events for Peppol document status updates.
 * Updates invoice peppolStatus based on transmission outcomes.
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import { parseWebhookEvent, verifyWebhookSecret } from "@/lib/peppol/webhook-parser"

let convexClient: ConvexHttpClient | null = null

function getConvexClient() {
  if (!convexClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not configured")
    convexClient = new ConvexHttpClient(url)
  }
  return convexClient
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify webhook secret
    const webhookSecret = process.env.STORECOVE_WEBHOOK_SECRET
    if (webhookSecret) {
      const headerSecret = request.headers.get("X-Storecove-Secret")
      if (!verifyWebhookSecret(headerSecret, webhookSecret)) {
        console.error("[Peppol Webhook] Invalid webhook secret")
        return NextResponse.json(
          { error: "Invalid webhook secret" },
          { status: 401 }
        )
      }
    }

    // 2. Parse webhook event
    const rawBody = await request.text()
    console.log("[Peppol Webhook] Received event:", rawBody.substring(0, 200))

    const event = parseWebhookEvent(rawBody)
    console.log(
      `[Peppol Webhook] Parsed: submissionGuid=${event.submissionGuid}, type=${event.eventType}`
    )

    // 3. Update invoice status in Convex
    const convex = getConvexClient()
    await convex.mutation(
      api.functions.salesInvoices.updatePeppolStatus,
      {
        peppolDocumentId: event.submissionGuid,
        status: event.eventType,
        timestamp: event.timestamp,
        errors: event.errors,
      }
    )

    console.log(
      `[Peppol Webhook] Updated status for ${event.submissionGuid}: ${event.eventType}`
    )

    // 4. Return 200 to acknowledge receipt
    return new NextResponse(null, { status: 200 })
  } catch (error) {
    console.error("[Peppol Webhook] Error:", error)

    // Always return 200 for webhook endpoints to prevent retries on parse errors
    // Only return non-200 for transient failures where retry would help
    if (error instanceof Error && error.message.includes("CONVEX")) {
      return NextResponse.json(
        { error: "Internal processing error" },
        { status: 500 }
      )
    }

    return new NextResponse(null, { status: 200 })
  }
}
