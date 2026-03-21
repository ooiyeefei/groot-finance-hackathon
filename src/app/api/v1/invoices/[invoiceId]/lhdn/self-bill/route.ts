/**
 * POST /api/v1/invoices/[invoiceId]/lhdn/self-bill
 *
 * Submit a self-billed e-invoice (type 11) for an AP/vendor invoice.
 * In self-billing, the business (buyer) issues the invoice on behalf of the vendor (seller).
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import { fromWebToken } from "@aws-sdk/credential-providers"
import type { AwsCredentialIdentityProvider } from "@smithy/types"
import {
  mapToSelfBilledInvoice,
  extractSelfBillBuyerData,
} from "@/lib/lhdn/self-bill-mapper"
import type { SelfBillData, SelfBillSellerData } from "@/lib/lhdn/self-bill-mapper"
import { authenticate, submitDocuments } from "@/lib/lhdn/client"
import { LhdnApiError } from "@/lib/lhdn/types"
import type { LhdnDocument, SignDocumentResponse } from "@/lib/lhdn/types"

// ============================================
// HELPERS
// ============================================

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

function getLambdaClient(): LambdaClient {
  const region = process.env.AWS_REGION || "us-west-2"
  const roleArn = process.env.AWS_ROLE_ARN

  const config: ConstructorParameters<typeof LambdaClient>[0] = { region }

  if (roleArn) {
    config.credentials = (async () => {
      const { getVercelOidcToken } = await import("@vercel/oidc")
      const oidcToken = await getVercelOidcToken()
      const provider = fromWebToken({
        roleArn,
        webIdentityToken: oidcToken,
        roleSessionName: `groot-lhdn-selfbill-${Date.now()}`,
        durationSeconds: 3600,
      })
      return provider()
    }) as AwsCredentialIdentityProvider
  }

  return new LambdaClient(config)
}

async function signDocumentViaLambda(
  documentJson: string,
  environment: string
): Promise<SignDocumentResponse> {
  const functionName =
    process.env.DIGITAL_SIGNATURE_LAMBDA_ARN || "finanseal-digital-signature:prod"

  const lambdaClient = getLambdaClient()
  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: "RequestResponse",
    Payload: Buffer.from(
      JSON.stringify({
        action: "sign",
        document: documentJson,
        environment,
      })
    ),
  })

  const response = await lambdaClient.send(command)

  if (response.FunctionError) {
    const errorPayload = response.Payload
      ? JSON.parse(Buffer.from(response.Payload).toString())
      : { error: "Lambda function error" }
    throw new Error(
      `Digital signature Lambda error: ${errorPayload.error || errorPayload.errorCode || "unknown"}`
    )
  }

  if (!response.Payload) {
    throw new Error("Digital signature Lambda returned empty payload")
  }

  const result = JSON.parse(
    Buffer.from(response.Payload).toString()
  ) as SignDocumentResponse

  if (!result.success) {
    throw new Error(
      `Digital signature failed: ${(result as unknown as { error: string }).error || "unknown error"}`
    )
  }

  return result
}

// ============================================
// ROUTE HANDLER
// ============================================

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

    // Parse request body
    let businessId: Id<"businesses">
    try {
      const body = await request.json()
      if (!body.businessId) {
        return NextResponse.json(
          { success: false, error: "businessId is required" },
          { status: 400 }
        )
      }
      businessId = body.businessId as Id<"businesses">
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      )
    }

    // 1. Validate and set status to pending
    try {
      await convex.mutation(api.functions.invoices.initiateSelfBill, {
        invoiceId: invoiceId as Id<"invoices">,
        businessId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json(
        { success: false, error: message },
        { status: 422 }
      )
    }

    // 2. Load invoice and business data
    const invoice = await convex.query(api.functions.invoices.getById, {
      id: invoiceId,
    })
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      )
    }

    const business = await convex.query(api.functions.businesses.getById, {
      id: businessId,
    })
    if (!business) {
      return NextResponse.json(
        { success: false, error: "Business not found" },
        { status: 404 }
      )
    }

    // 3. Record e-invoice usage
    await convex.mutation(api.functions.einvoiceUsage.recordUsage, {
      businessId,
    })

    // 4. Map to self-billed UBL 2.1 JSON (type 11)
    const biz = business as Record<string, unknown>
    const inv = invoice as Record<string, unknown>
    const extracted = (inv.extractedData as Record<string, unknown> | undefined) ?? {}

    const buyerData = extractSelfBillBuyerData({
      name: business.name,
      legalName: biz.legalName as string | undefined,
      lhdnTin: biz.lhdnTin as string | undefined,
      businessRegistrationNumber: biz.businessRegistrationNumber as string | undefined,
      sstRegistrationNumber: biz.sstRegistrationNumber as string | undefined,
      msicCode: biz.msicCode as string | undefined,
      addressLine1: biz.addressLine1 as string | undefined,
      addressLine2: biz.addressLine2 as string | undefined,
      addressLine3: biz.addressLine3 as string | undefined,
      city: biz.city as string | undefined,
      stateCode: biz.stateCode as string | undefined,
      postalCode: biz.postalCode as string | undefined,
      countryCode: biz.countryCode as string | undefined,
      phone: biz.phone as string | undefined,
      contactEmail: biz.contactEmail as string | undefined,
    })

    const vendorName = (extracted.vendor_name as string) ??
      (extracted.vendorName as string) ?? "Unknown Vendor"

    const sellerData: SelfBillSellerData = {
      name: vendorName,
    }

    // Build line items from extracted data
    type RawLineItem = {
      item_description?: string
      description?: string
      quantity?: number
      unit_price?: number
      total_amount?: number
      tax_rate?: number
      tax_amount?: number
    }
    const rawLineItems = ((extracted.line_items ?? extracted.lineItems) as RawLineItem[] | undefined) ?? []
    const totalAmount = (extracted.total_amount as number) ??
      (extracted.totalAmount as number) ?? 0
    const currency = (extracted.currency as string) ?? "MYR"
    const invoiceDate = (extracted.invoice_date as string) ??
      (extracted.invoiceDate as string) ?? new Date().toISOString().split("T")[0]

    const selfBillData: SelfBillData = {
      referenceNumber: `SB-INV-${invoiceId.slice(-8)}`,
      date: invoiceDate,
      currency,
      lineItems: rawLineItems.length > 0
        ? rawLineItems.map((item, idx) => ({
            lineOrder: idx + 1,
            description: item.item_description || item.description || "Invoice line item",
            quantity: item.quantity ?? 1,
            unitPrice: item.unit_price ?? item.total_amount ?? 0,
            totalAmount: item.total_amount ?? 0,
            taxRate: item.tax_rate,
            taxAmount: item.tax_amount,
          }))
        : [{
            lineOrder: 1,
            description: vendorName + " - Invoice",
            quantity: 1,
            unitPrice: totalAmount,
            totalAmount: totalAmount,
          }],
      subtotal: totalAmount,
      totalTax: 0,
      totalAmount: totalAmount,
    }

    const ublDocument = mapToSelfBilledInvoice(selfBillData, buyerData, sellerData)
    const documentJson = JSON.stringify(ublDocument)

    // 5. Sign via Lambda
    const lhdnEnv = process.env.LHDN_ENVIRONMENT || "sandbox"
    const signResult = await signDocumentViaLambda(documentJson, lhdnEnv)

    // 6. Get LHDN access token
    const tenantTin = buyerData.tin
    if (!tenantTin) {
      return NextResponse.json(
        { success: false, error: "Business LHDN TIN is not configured" },
        { status: 400 }
      )
    }

    const tokenResult = await authenticate(tenantTin)

    // 7. Submit to LHDN
    const lhdnDoc: LhdnDocument = {
      format: "JSON",
      document: signResult.signedDocument,
      documentHash: signResult.documentHash,
      codeNumber: selfBillData.referenceNumber,
    }

    const submissionResponse = await submitDocuments([lhdnDoc], tokenResult.accessToken)

    // 8. Update status based on response
    const accepted = submissionResponse.acceptedDocuments?.[0]
    const rejected = submissionResponse.rejectedDocuments?.[0]

    if (rejected) {
      await convex.mutation(api.functions.invoices.updateLhdnStatus, {
        invoiceId: invoiceId as Id<"invoices">,
        lhdnStatus: "invalid",
        lhdnSubmissionId: submissionResponse.submissionUid,
        lhdnValidationErrors: [
          {
            code: rejected.error.code,
            message: rejected.error.message,
            target: rejected.error.target,
          },
        ],
      })

      return NextResponse.json({
        success: false,
        error: "Document rejected by LHDN",
        data: {
          submissionUid: submissionResponse.submissionUid,
          lhdnStatus: "invalid",
          errors: [rejected.error],
        },
      })
    }

    if (accepted) {
      await convex.mutation(api.functions.invoices.updateLhdnStatus, {
        invoiceId: invoiceId as Id<"invoices">,
        lhdnStatus: "submitted",
        lhdnDocumentUuid: accepted.uuid,
        lhdnSubmissionId: submissionResponse.submissionUid,
        lhdnDocumentHash: signResult.documentHash,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        submissionUid: submissionResponse.submissionUid,
        lhdnStatus: "submitted",
        documentUuid: accepted?.uuid,
      },
    })
  } catch (error) {
    console.error("[LHDN Self-Bill Invoice] Error:", error)

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
