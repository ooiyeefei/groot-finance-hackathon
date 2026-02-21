/**
 * GET /api/v1/peppol/discovery?peppolId={participantId}
 *
 * Verify a receiver's Peppol participant ID is active on the network.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { discoverReceiver } from "@/lib/peppol/storecove-client"
import { parsePeppolId } from "@/lib/peppol/invoice-mapper"
import { StorecoveApiError } from "@/lib/peppol/types"

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    const peppolId = request.nextUrl.searchParams.get("peppolId")
    if (!peppolId) {
      return NextResponse.json(
        { success: false, error: "peppolId query parameter is required" },
        { status: 400 }
      )
    }

    const { scheme, identifier } = parsePeppolId(peppolId)
    const result = await discoverReceiver(scheme, identifier)

    return NextResponse.json({
      success: true,
      data: {
        active: result.active,
        network: "peppol",
        participantId: peppolId,
      },
    })
  } catch (error) {
    console.error("[Peppol Discovery] Error:", error)

    if (error instanceof StorecoveApiError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    )
  }
}
