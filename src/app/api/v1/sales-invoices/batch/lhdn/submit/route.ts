/**
 * POST /api/v1/sales-invoices/batch/lhdn/submit
 *
 * Batch submit multiple sales invoices to LHDN MyInvois.
 * Processes each invoice individually, returning per-invoice results.
 * Respects LHDN's 100-document limit per submission.
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

const MAX_BATCH_SIZE = 100

// ============================================
// HELPERS (same as single submit route)
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
        roleSessionName: `finanseal-lhdn-batch-${Date.now()}`,
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

interface BatchResult {
  invoiceId: string
  invoiceNumber?: string
  success: boolean
  lhdnStatus?: string
  documentUuid?: string
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    // Parse request body
    let businessId: Id<"businesses">
    let invoiceIds: string[]
    let useGeneralBuyerTin = false
    try {
      const body = await request.json()
      if (!body.businessId) {
        return NextResponse.json(
          { success: false, error: "businessId is required" },
          { status: 400 }
        )
      }
      if (!Array.isArray(body.invoiceIds) || body.invoiceIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "invoiceIds array is required and must not be empty" },
          { status: 400 }
        )
      }
      if (body.invoiceIds.length > MAX_BATCH_SIZE) {
        return NextResponse.json(
          { success: false, error: `Maximum ${MAX_BATCH_SIZE} invoices per batch` },
          { status: 400 }
        )
      }
      businessId = body.businessId as Id<"businesses">
      invoiceIds = body.invoiceIds as string[]
      useGeneralBuyerTin = body.useGeneralBuyerTin === true
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      )
    }

    const convex = await getAuthenticatedConvexClient()

    // Load business data once
    const business = await convex.query(api.functions.businesses.getById, {
      id: businessId,
    })
    if (!business) {
      return NextResponse.json(
        { success: false, error: "Business not found" },
        { status: 404 }
      )
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

    const tenantTin = supplierData.tin
    if (!tenantTin) {
      return NextResponse.json(
        { success: false, error: "Business LHDN TIN is not configured" },
        { status: 400 }
      )
    }

    // Authenticate with LHDN once for the batch
    const tokenResult = await authenticate(tenantTin)
    const lhdnEnv = process.env.LHDN_ENVIRONMENT || "sandbox"

    const results: BatchResult[] = []
    const lhdnDocs: { doc: LhdnDocument; invoiceId: string; invoiceDbId: Id<"sales_invoices">; signResult: SignDocumentResponse }[] = []

    // Phase 1: Validate, map, and sign each invoice
    for (const invoiceId of invoiceIds) {
      try {
        // Initiate submission (validates status, LHDN config, etc.)
        await convex.mutation(api.functions.salesInvoices.initiateLhdnSubmission, {
          id: invoiceId as Id<"sales_invoices">,
          businessId,
          useGeneralBuyerTin,
        })

        // Load invoice data
        const invoice = await convex.query(api.functions.salesInvoices.getById, {
          id: invoiceId,
          businessId,
        })
        if (!invoice) {
          results.push({ invoiceId, success: false, error: "Invoice not found" })
          continue
        }

        // Record usage
        await convex.mutation(api.functions.einvoiceUsage.recordUsage, {
          businessId,
        })

        // Resolve original invoice number for credit notes
        let originalInvoiceNumber: string | undefined
        if (invoice.einvoiceType === "credit_note" && invoice.originalInvoiceId) {
          const original = await convex.query(api.functions.salesInvoices.getById, {
            id: invoice.originalInvoiceId as string,
            businessId,
          })
          originalInvoiceNumber = original?.invoiceNumber
        }

        // Map to UBL
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

        // Sign via Lambda
        const documentJson = JSON.stringify(ublDocument)
        const signResult = await signDocumentViaLambda(documentJson, lhdnEnv)

        lhdnDocs.push({
          doc: {
            format: "JSON",
            document: signResult.signedDocument,
            documentHash: signResult.documentHash,
            codeNumber: invoice.invoiceNumber,
          },
          invoiceId,
          invoiceDbId: invoice._id as Id<"sales_invoices">,
          signResult,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        results.push({
          invoiceId,
          success: false,
          error: message,
        })
      }
    }

    // Phase 2: Submit all valid documents to LHDN in one batch
    if (lhdnDocs.length > 0) {
      try {
        const submissionResponse = await submitDocuments(
          lhdnDocs.map((d) => d.doc),
          tokenResult.accessToken
        )

        // Process accepted documents
        for (const accepted of submissionResponse.acceptedDocuments || []) {
          const match = lhdnDocs.find((d) => d.doc.codeNumber === accepted.invoiceCodeNumber)
          if (match) {
            await convex.mutation(api.functions.salesInvoices.updateLhdnStatus, {
              invoiceId: match.invoiceDbId,
              lhdnStatus: "submitted",
              lhdnDocumentUuid: accepted.uuid,
              lhdnSubmissionId: submissionResponse.submissionUid,
              lhdnDocumentHash: match.signResult.documentHash,
            })
            results.push({
              invoiceId: match.invoiceId,
              invoiceNumber: match.doc.codeNumber,
              success: true,
              lhdnStatus: "submitted",
              documentUuid: accepted.uuid,
            })
          }
        }

        // Process rejected documents
        for (const rejected of submissionResponse.rejectedDocuments || []) {
          const match = lhdnDocs.find((d) => d.doc.codeNumber === rejected.invoiceCodeNumber)
          if (match) {
            await convex.mutation(api.functions.salesInvoices.updateLhdnStatus, {
              invoiceId: match.invoiceDbId,
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
            results.push({
              invoiceId: match.invoiceId,
              invoiceNumber: match.doc.codeNumber,
              success: false,
              lhdnStatus: "invalid",
              error: rejected.error.message,
            })
          }
        }
      } catch (error) {
        // If the batch submission itself fails, mark all pending docs as failed
        const message = error instanceof LhdnApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Batch submission failed"

        for (const doc of lhdnDocs) {
          // Only add to results if not already there
          if (!results.some((r) => r.invoiceId === doc.invoiceId)) {
            results.push({
              invoiceId: doc.invoiceId,
              invoiceNumber: doc.doc.codeNumber,
              success: false,
              error: message,
            })
          }
        }
      }
    }

    const accepted = results.filter((r) => r.success)
    const rejected = results.filter((r) => !r.success)

    return NextResponse.json({
      success: true,
      data: {
        total: invoiceIds.length,
        accepted: accepted.length,
        rejected: rejected.length,
        results,
      },
    })
  } catch (error) {
    console.error("[LHDN Batch Submit] Error:", error)

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
