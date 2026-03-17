/**
 * PUT /api/v1/sales-invoices/[invoiceId]/lhdn/cancel
 *
 * Cancel a validated LHDN e-invoice within the 72-hour window.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { authenticate, cancelDocument } from "@/lib/lhdn/client"
import { LhdnApiError } from "@/lib/lhdn/types"

async function getAuthenticatedConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not configured")
  const convex = new ConvexHttpClient(url)

  const clerkAuth = await auth()
  const token = await clerkAuth.getToken({ template: "convex" })
  if (token) {
    convex.setAuth(token)
  }

  return convex
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    const { invoiceId } = await params
    const convex = await getAuthenticatedConvexClient()

    // Parse request body
    let businessId: Id<"businesses">
    let reason: string
    try {
      const body = await request.json()
      if (!body.businessId) {
        return NextResponse.json(
          { success: false, error: "businessId is required" },
          { status: 400 }
        )
      }
      if (!body.reason?.trim()) {
        return NextResponse.json(
          { success: false, error: "Cancellation reason is required" },
          { status: 400 }
        )
      }
      businessId = body.businessId as Id<"businesses">
      reason = body.reason.trim()
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      )
    }

    // 1. Validate and update Convex status
    let documentUuid: string
    try {
      const result = await convex.mutation(
        api.functions.salesInvoices.cancelLhdnSubmission,
        {
          id: invoiceId as Id<"sales_invoices">,
          businessId,
          reason,
        }
      )
      documentUuid = (result as { documentUuid: string }).documentUuid
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("CANCELLATION_WINDOW_EXPIRED")) {
        return NextResponse.json(
          {
            success: false,
            error: "CANCELLATION_WINDOW_EXPIRED",
            message: "The 72-hour cancellation window has expired.",
          },
          { status: 422 }
        )
      }
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 }
      )
    }

    // 2. Get business TIN for authentication
    const business = await convex.query(api.functions.businesses.getById, {
      id: businessId,
    })
    const tenantTin = (business as Record<string, unknown>)?.lhdnTin as string
    if (!tenantTin) {
      return NextResponse.json(
        { success: false, error: "Business LHDN TIN is not configured" },
        { status: 400 }
      )
    }

    // 3. Authenticate and cancel with LHDN
    const tokenResult = await authenticate(tenantTin)
    await cancelDocument(documentUuid, reason, tokenResult.accessToken)

    // 4. Trigger buyer cancellation notification (023-einv-buyer-notifications)
    // Fire-and-forget: notification failure does not block cancellation response
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000")
      const internalKey = process.env.MCP_INTERNAL_SERVICE_KEY

      if (internalKey) {
        // Trigger the notification asynchronously
        fetch(`${baseUrl}/api/v1/sales-invoices/${invoiceId}/lhdn/notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": internalKey,
          },
          body: JSON.stringify({
            businessId,
            eventType: "cancellation",
            cancellationReason: reason,
          }),
        }).catch((err) => {
          console.error("[LHDN Cancel] Buyer notification request failed:", err)
        })
      } else {
        console.warn("[LHDN Cancel] MCP_INTERNAL_SERVICE_KEY not configured, skipping buyer notification")
      }
    } catch (notifError) {
      // Notification failure should not block the cancellation response
      console.error("[LHDN Cancel] Failed to trigger buyer notification:", notifError)
    }

    return NextResponse.json({
      success: true,
      data: {
        lhdnStatus: "cancelled",
        documentUuid,
      },
    })
  } catch (error) {
    console.error("[LHDN Cancel] Error:", error)

    if (error instanceof LhdnApiError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          lhdnErrors: error.errors,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    )
  }
}
