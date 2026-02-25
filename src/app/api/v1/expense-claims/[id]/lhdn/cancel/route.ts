/**
 * PUT /api/v1/expense-claims/[id]/lhdn/cancel
 *
 * Cancel a validated self-billed e-invoice within the 72-hour window.
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    const { id: claimId } = await params
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
        api.functions.expenseClaims.cancelLhdnSubmission,
        {
          claimId: claimId as Id<"expense_claims">,
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
        { status: 422 }
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

    return NextResponse.json({
      success: true,
      data: {
        lhdnStatus: "cancelled",
        documentUuid,
      },
    })
  } catch (error) {
    console.error("[LHDN Cancel Self-Bill Expense] Error:", error)

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
