/**
 * POST /api/v1/sales-invoices/[invoiceId]/lhdn/submit
 *
 * Submit a sales invoice to LHDN MyInvois for validation.
 * Orchestrates: validate → map → sign (Lambda) → submit to LHDN → update status.
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
  mapInvoiceToLhdn,
  extractSupplierData,
  extractBuyerData,
} from "@/lib/lhdn/invoice-mapper"
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
        roleSessionName: `groot-lhdn-sign-${Date.now()}`,
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
    let useGeneralBuyerTin = false
    try {
      const body = await request.json()
      if (!body.businessId) {
        return NextResponse.json(
          { success: false, error: "businessId is required" },
          { status: 400 }
        )
      }
      businessId = body.businessId as Id<"businesses">
      useGeneralBuyerTin = body.useGeneralBuyerTin === true
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      )
    }

    // 1. Validate and set status to pending
    try {
      await convex.mutation(api.functions.salesInvoices.initiateLhdnSubmission, {
        id: invoiceId as Id<"sales_invoices">,
        businessId,
        useGeneralBuyerTin,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("BUYER_TIN_MISSING")) {
        return NextResponse.json(
          {
            success: false,
            error: "BUYER_TIN_MISSING",
            message:
              "The buyer does not have a TIN. Confirm to use the general public TIN (EI00000000000).",
          },
          { status: 422 }
        )
      }
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 }
      )
    }

    // 2. Load invoice, business data
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

    // 4. Map to UBL 2.1 JSON
    let originalInvoiceNumber: string | undefined
    if (invoice.einvoiceType === "credit_note" && invoice.originalInvoiceId) {
      const original = await convex.query(api.functions.salesInvoices.getById, {
        id: invoice.originalInvoiceId as string,
        businessId,
      })
      originalInvoiceNumber = original?.invoiceNumber
    }

    const biz = business as Record<string, unknown>
    const supplierData = extractSupplierData({
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

    const buyerData = extractBuyerData({
      businessName: invoice.customerSnapshot?.businessName || "Unknown Buyer",
      tin: invoice.customerSnapshot?.tin,
      brn: invoice.customerSnapshot?.brn,
      addressLine1: invoice.customerSnapshot?.addressLine1,
      addressLine2: invoice.customerSnapshot?.addressLine2,
      addressLine3: invoice.customerSnapshot?.addressLine3,
      city: invoice.customerSnapshot?.city,
      stateCode: invoice.customerSnapshot?.stateCode,
      postalCode: invoice.customerSnapshot?.postalCode,
      countryCode: invoice.customerSnapshot?.countryCode,
    })

    const ublDocument = mapInvoiceToLhdn(
      {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        currency: invoice.currency,
        lineItems: invoice.lineItems,
        subtotal: invoice.subtotal,
        totalTax: invoice.totalTax,
        totalAmount: invoice.totalAmount,
        notes: invoice.notes,
        einvoiceType: invoice.einvoiceType,
        originalInvoiceNumber,
      },
      supplierData,
      buyerData,
      { useGeneralBuyerTin }
    )

    const documentJson = JSON.stringify(ublDocument)

    // 5. Sign via Lambda
    const lhdnEnv = process.env.LHDN_ENVIRONMENT || "sandbox"
    const signResult = await signDocumentViaLambda(documentJson, lhdnEnv)

    // 6. Get LHDN access token (authenticate fresh — 12 RPM limit is adequate)
    const tenantTin = supplierData.tin
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
      codeNumber: invoice.invoiceNumber,
    }

    const submissionResponse = await submitDocuments([lhdnDoc], tokenResult.accessToken)

    // 8. Update status based on response
    const accepted = submissionResponse.acceptedDocuments?.[0]
    const rejected = submissionResponse.rejectedDocuments?.[0]

    if (rejected) {
      await convex.mutation(api.functions.salesInvoices.updateLhdnStatus, {
        invoiceId: invoice._id as Id<"sales_invoices">,
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
      await convex.mutation(api.functions.salesInvoices.updateLhdnStatus, {
        invoiceId: invoice._id as Id<"sales_invoices">,
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
    console.error("[LHDN Submit] Error:", error)

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
