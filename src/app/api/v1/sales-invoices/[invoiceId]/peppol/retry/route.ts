/**
 * POST /api/v1/sales-invoices/[invoiceId]/peppol/retry
 *
 * Retry a failed Peppol transmission.
 * Same flow as transmit, but validates peppolStatus === "failed" first.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { submitDocument } from "@/lib/peppol/storecove-client"
import {
  mapInvoiceToStorecove,
  mapStorecoveErrorsToPeppolErrors,
} from "@/lib/peppol/invoice-mapper"
import { StorecoveApiError } from "@/lib/peppol/types"

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

    // Parse businessId from body
    let businessId: Id<"businesses"> | undefined
    try {
      const body = await request.json()
      if (body.businessId) {
        businessId = body.businessId as Id<"businesses">
      }
    } catch {
      // No body is fine
    }

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "businessId is required in request body" },
        { status: 400 }
      )
    }

    // 1. Load and validate invoice
    const invoice = await convex.query(api.functions.salesInvoices.getById, {
      id: invoiceId,
      businessId,
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      )
    }

    // 2. Validate failed status
    if (invoice.peppolStatus !== "failed") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Can only retry transmission for invoices with failed Peppol status",
        },
        { status: 400 }
      )
    }

    // 3. Reset status via Convex mutation
    await convex.mutation(
      api.functions.salesInvoices.retryPeppolTransmission,
      {
        id: invoice._id as Id<"sales_invoices">,
        businessId,
      }
    )

    // 4. Load business and customer
    const business = await convex.query(api.functions.businesses.getById, {
      id: businessId,
    })
    if (!business || !business.peppolParticipantId) {
      return NextResponse.json(
        {
          success: false,
          error: "Business does not have a Peppol participant ID",
        },
        { status: 400 }
      )
    }

    let customer = null
    if (invoice.customerId) {
      customer = await convex.query(api.functions.customers.getById, {
        id: invoice.customerId as Id<"customers">,
        businessId,
      })
    }
    if (!customer || !customer.peppolParticipantId) {
      return NextResponse.json(
        {
          success: false,
          error: "Customer does not have a Peppol participant ID",
        },
        { status: 400 }
      )
    }

    // 5. Map and resubmit
    let originalInvoiceNumber: string | undefined
    if (
      invoice.einvoiceType === "credit_note" &&
      invoice.originalInvoiceId
    ) {
      const orig = await convex.query(api.functions.salesInvoices.getById, {
        id: invoice.originalInvoiceId as string,
        businessId,
      })
      originalInvoiceNumber = orig?.invoiceNumber
    }

    const storecovePayload = mapInvoiceToStorecove(
      {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        currency: invoice.currency,
        lineItems: invoice.lineItems,
        subtotal: invoice.subtotal,
        totalTax: invoice.totalTax,
        totalAmount: invoice.totalAmount,
        notes: invoice.notes,
        einvoiceType: invoice.einvoiceType,
        originalInvoiceNumber,
      },
      {
        businessName: (business as any).legalName || business.name,
        peppolParticipantId: business.peppolParticipantId,
        addressLine1: (business as any).address,
        countryCode: (business as any).countryCode || "SG",
        email: (business as any).contactEmail,
      },
      {
        businessName: customer.businessName,
        peppolParticipantId: customer.peppolParticipantId,
        addressLine1: (customer as any).addressLine1 || customer.address,
        city: (customer as any).city,
        postalCode: (customer as any).postalCode,
        countryCode: (customer as any).countryCode || "SG",
        email: customer.email,
        contactPerson: customer.contactPerson,
        phone: customer.phone,
      }
    )

    const storecoveResponse = await submitDocument(storecovePayload)

    // 6. Update Convex
    await convex.mutation(
      api.functions.salesInvoices.setPeppolDocumentId,
      {
        invoiceId: invoice._id as Id<"sales_invoices">,
        peppolDocumentId: storecoveResponse.guid,
        peppolStatus: "pending",
      }
    )

    return NextResponse.json({
      success: true,
      data: {
        peppolDocumentId: storecoveResponse.guid,
        status: "pending",
      },
    })
  } catch (error) {
    console.error("[Peppol Retry] Error:", error)

    if (error instanceof StorecoveApiError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          peppolErrors: error.errors
            ? mapStorecoveErrorsToPeppolErrors(error.errors)
            : undefined,
        },
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
