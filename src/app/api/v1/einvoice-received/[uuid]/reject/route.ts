/**
 * POST /api/v1/einvoice-received/[uuid]/reject
 *
 * Reject a received e-invoice from a supplier via LHDN API.
 * Must be within 72-hour window from document creation/validation.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { authenticate, rejectDocument } from "@/lib/lhdn/client"
import { LhdnApiError } from "@/lib/lhdn/types"

const REJECTION_WINDOW_MS = 72 * 60 * 60 * 1000 // 72 hours

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    const { uuid } = await params
    const convex = await getAuthenticatedConvexClient()

    // Parse request body
    let businessId: string
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
          { success: false, error: "Rejection reason is required" },
          { status: 400 }
        )
      }
      businessId = body.businessId
      reason = body.reason.trim()
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      )
    }

    // 1. Look up the received document by UUID
    const doc = await convex.query(
      api.functions.einvoiceReceivedDocuments.getByUuid,
      { uuid }
    )

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Received document not found" },
        { status: 404 }
      )
    }

    // 2. Validate document status is "valid" (idempotency check)
    if (doc.status === "rejected") {
      // Idempotency: Already rejected, return success immediately
      return NextResponse.json({
        success: true,
        data: {
          lhdnStatus: "rejected",
          documentUuid: uuid,
          message: "Document already rejected",
        },
      })
    }

    if (doc.status !== "valid") {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot reject document with status "${doc.status}". Only "valid" documents can be rejected.`,
        },
        { status: 422 }
      )
    }

    // 3. Validate within 72-hour rejection window
    const documentTimestamp = doc.processedAt || doc._creationTime
    const elapsed = Date.now() - documentTimestamp
    if (elapsed > REJECTION_WINDOW_MS) {
      return NextResponse.json(
        {
          success: false,
          error: "REJECTION_WINDOW_EXPIRED",
          message: "The 72-hour rejection window has expired.",
        },
        { status: 422 }
      )
    }

    // 4. Get business TIN for LHDN authentication
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

    // 5. Authenticate with LHDN and reject the document
    let tokenResult
    try {
      tokenResult = await authenticate(tenantTin)
    } catch (authError) {
      console.error("[LHDN Reject] Authentication failed:", authError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to authenticate with LHDN. Please check your business TIN configuration.",
          details: authError instanceof Error ? authError.message : "Authentication error",
        },
        { status: 502 }
      )
    }

    try {
      await rejectDocument(uuid, reason, tokenResult.accessToken)
    } catch (rejectError) {
      console.error("[LHDN Reject] Rejection request failed:", rejectError)

      // Handle specific LHDN API errors
      if (rejectError instanceof LhdnApiError) {
        // Check for rate limit (LHDN has 12 RPM limit)
        if (rejectError.message.includes("rate limit") || rejectError.message.includes("429")) {
          return NextResponse.json(
            {
              success: false,
              error: "LHDN rate limit exceeded. Please try again in a few moments.",
              lhdnErrors: rejectError.errors,
            },
            { status: 429 }
          )
        }

        // Check for already rejected on LHDN side
        if (rejectError.message.includes("already rejected") || rejectError.message.includes("invalid state")) {
          // Update local status to match LHDN
          try {
            await convex.mutation(
              api.functions.einvoiceReceivedDocuments.rejectReceivedDocument,
              {
                documentId: doc._id as Id<"einvoice_received_documents">,
                documentUuid: uuid,
                reason: "Already rejected on LHDN",
                rejectedByUserId: userId,
              }
            )
          } catch (updateError) {
            console.error("[LHDN Reject] Failed to sync status after concurrent rejection:", updateError)
          }

          return NextResponse.json({
            success: true,
            data: {
              lhdnStatus: "rejected",
              documentUuid: uuid,
              message: "Document was already rejected (concurrent request or LHDN status sync)",
            },
          })
        }

        // Generic LHDN API error
        return NextResponse.json(
          {
            success: false,
            error: "LHDN API error: " + rejectError.message,
            lhdnErrors: rejectError.errors,
          },
          { status: 502 }
        )
      }

      // Network timeout or other errors
      throw rejectError
    }

    // 6. Update Convex (document status + expense claim unlink + notification)
    try {
      await convex.mutation(
        api.functions.einvoiceReceivedDocuments.rejectReceivedDocument,
        {
          documentId: doc._id as Id<"einvoice_received_documents">,
          documentUuid: uuid,
          reason,
          rejectedByUserId: userId,
        }
      )
    } catch (error) {
      // LHDN rejection succeeded but Convex update failed — log and continue
      console.error("[LHDN Reject] Convex update failed after LHDN rejection:", error)
    }

    return NextResponse.json({
      success: true,
      data: {
        lhdnStatus: "rejected",
        documentUuid: uuid,
      },
    })
  } catch (error) {
    console.error("[LHDN Reject E-Invoice] Error:", error)

    // Network/timeout errors
    if (error instanceof Error) {
      if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT")) {
        return NextResponse.json(
          {
            success: false,
            error: "Request timed out. The LHDN service may be temporarily unavailable. Please try again.",
          },
          { status: 504 }
        )
      }

      if (error.message.includes("ECONNREFUSED") || error.message.includes("network")) {
        return NextResponse.json(
          {
            success: false,
            error: "Could not connect to LHDN service. Please check your network connection and try again.",
          },
          { status: 503 }
        )
      }
    }

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
