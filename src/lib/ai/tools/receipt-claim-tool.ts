/**
 * Receipt Claim Tool
 *
 * Processes receipt images attached in chat to create draft expense claims.
 * Flow: parse attachment refs from message → invoke document processor Lambda →
 *       poll for OCR completion → create draft expense claim → return action card data.
 *
 * Part of 031-chat-receipt-process.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { invokeDocumentProcessorSync } from '@/lib/lambda-invoker'
import { getAuthenticatedConvex } from '@/lib/convex'

interface ReceiptAttachment {
  s3Path: string
  mimeType: string
  filename: string
}

interface ReceiptClaimResult {
  claimId: string
  status: 'draft'
  merchant: string
  amount: number
  currency: string
  date: string
  category: string
  confidence: number
  receiptS3Path: string
  lowConfidenceFields: string[]
  duplicateWarning?: boolean
  existingClaimId?: string
}

export class ReceiptClaimTool extends BaseTool {
  getToolName(_modelType?: ModelType): string {
    return 'create_expense_from_receipt'
  }

  getDescription(_modelType?: ModelType): string {
    return 'Process receipt images attached in chat to create expense claims. Extracts merchant, amount, date, category via OCR and creates a draft expense claim. Use when the user sends receipt photos or images.'
  }

  getToolSchema(_modelType?: ModelType): OpenAIToolSchema {
    return {
      type: 'function' as const,
      function: {
        name: 'create_expense_from_receipt',
        description: this.getDescription(),
        parameters: {
          type: 'object',
          properties: {
            attachments: {
              type: 'array',
              description: 'Receipt image attachments from the chat message',
              items: {
                type: 'object',
                properties: {
                  s3Path: { type: 'string', description: 'S3 key for the uploaded receipt image' },
                  mimeType: { type: 'string', description: 'MIME type of the file' },
                  filename: { type: 'string', description: 'Original filename' },
                },
                required: ['s3Path', 'mimeType', 'filename'],
              },
            },
            businessPurpose: {
              type: 'string',
              description: 'Optional business purpose provided by the user',
            },
          },
          required: ['attachments'],
        },
      },
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const { attachments } = parameters as { attachments?: ReceiptAttachment[] }
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
      return { valid: false, error: 'No receipt attachments provided' }
    }
    for (const att of attachments) {
      if (!att.s3Path || !att.mimeType || !att.filename) {
        return { valid: false, error: 'Each attachment must have s3Path, mimeType, and filename' }
      }
    }
    return { valid: true }
  }

  protected async executeInternal(
    parameters: ToolParameters,
    userContext: UserContext
  ): Promise<ToolResult> {
    const { attachments, businessPurpose } = parameters as {
      attachments: ReceiptAttachment[]
      businessPurpose?: string
    }

    const results: ReceiptClaimResult[] = []
    const errors: string[] = []

    for (const attachment of attachments) {
      try {
        const result = await this.processOneReceipt(attachment, userContext, businessPurpose)
        results.push(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error processing receipt'
        errors.push(`${attachment.filename}: ${msg}`)
      }
    }

    if (results.length === 0 && errors.length > 0) {
      return {
        success: false,
        error: `Failed to process receipts: ${errors.join('; ')}`,
      }
    }

    // Return text for the LLM + structured action card data as JSON block
    // The action card JSON is embedded in the text since metadata is lost
    // in the LangGraph tool node → ToolMessage pipeline.
    // The copilotkit-adapter's autoGenerateActionsFromToolResults() parses it.
    if (results.length === 1) {
      const r = results[0]
      // Emit as JSON so autoGenerateActionsFromToolResults can parse it
      return {
        success: true,
        data: JSON.stringify(r),
      }
    }

    // Multiple receipts: return batch summary as JSON
    return {
      success: true,
      data: JSON.stringify({
        batch: true,
        claims: results,
        errors,
      }),
    }
  }

  private async processOneReceipt(
    attachment: ReceiptAttachment,
    userContext: UserContext,
    businessPurpose?: string
  ): Promise<ReceiptClaimResult> {
    const { userId, businessId } = userContext
    if (!businessId) throw new Error('Business context required')

    const documentId = crypto.randomUUID()
    const fileType = attachment.mimeType === 'application/pdf' ? 'pdf' : 'image'

    // 1. Invoke document processor Lambda SYNCHRONOUSLY for OCR
    // Uses RequestResponse invocation to get results immediately (15-20s typical)
    console.log(`[ReceiptClaimTool] Invoking doc processor (sync) for ${attachment.filename}`)
    let lambdaResult: unknown = null
    try {
      lambdaResult = await invokeDocumentProcessorSync({
        documentId,
        domain: 'expense_claims',
        storagePath: attachment.s3Path,
        fileType: fileType as 'pdf' | 'image',
        userId,
        businessId,
        idempotencyKey: `chat-receipt-${documentId}`,
        expectedDocumentType: 'receipt',
      })
    } catch (invokeErr) {
      console.error(`[ReceiptClaimTool] Lambda invocation failed:`, invokeErr)
      throw new Error(`Receipt processing failed: ${invokeErr instanceof Error ? invokeErr.message : 'Unknown error'}`)
    }

    // 2. Parse OCR results from Lambda response
    const extractedData = this.parseLambdaResult(lambdaResult)

    // 3. Check for duplicates (requires Convex user ID for the query)
    const duplicate = await this.checkDuplicate(extractedData, businessId, userContext.convexUserId)

    // 4. Create draft expense claim via Convex mutation
    const { client } = await getAuthenticatedConvex()
    if (!client) throw new Error('Could not connect to database')

    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
    const { api } = require('@/convex/_generated/api') as any

    // 4a. Create an expense submission (container) so the claim appears in the UI
    const vendorLabel = extractedData.vendorName || 'Receipt'
    const submissionId = await client.mutation(api.functions.expenseSubmissions.create, {
      businessId,
      title: `Chat: ${vendorLabel}`,
    } as any)
    console.log(`[ReceiptClaimTool] Created submission ${submissionId} for ${attachment.filename}`)

    // 4b. Create the expense claim linked to the submission
    const createArgs = {
      businessId,
      vendorName: extractedData.vendorName || 'Unknown Merchant',
      totalAmount: extractedData.totalAmount,
      currency: extractedData.currency || 'MYR',
      transactionDate: extractedData.transactionDate,
      expenseCategory: extractedData.category || 'General',
      businessPurpose: businessPurpose || `Receipt: ${extractedData.vendorName || attachment.filename}`,
      status: 'draft' as const,
      storagePath: attachment.s3Path,
      fileName: attachment.filename,
      fileType: attachment.mimeType,
      submissionId,
    }
    const claimId = await client.mutation(api.functions.expenseClaims.create, createArgs as any)

    console.log(`[ReceiptClaimTool] Created draft claim ${claimId} for ${attachment.filename}`)

    // Identify low-confidence fields
    const lowConfidenceFields: string[] = []
    if (extractedData.fieldConfidence) {
      for (const [field, conf] of Object.entries(extractedData.fieldConfidence)) {
        if (typeof conf === 'number' && conf < 0.7) {
          lowConfidenceFields.push(field)
        }
      }
    }

    return {
      claimId: claimId as string,
      status: 'draft',
      merchant: extractedData.vendorName || 'Unknown Merchant',
      amount: extractedData.totalAmount,
      currency: extractedData.currency || 'MYR',
      date: extractedData.transactionDate,
      category: extractedData.category || 'General',
      confidence: extractedData.confidence,
      receiptS3Path: attachment.s3Path,
      lowConfidenceFields,
      duplicateWarning: duplicate.isDuplicate,
      existingClaimId: duplicate.existingClaimId,
    }
  }

  private parseLambdaResult(result: unknown): {
    vendorName: string
    totalAmount: number
    currency: string
    transactionDate: string
    category: string
    description: string
    confidence: number
    fieldConfidence: Record<string, number>
  } {
    const defaults = {
      vendorName: '',
      totalAmount: 0,
      currency: 'MYR',
      transactionDate: new Date().toISOString().split('T')[0],
      category: 'General',
      description: '',
      confidence: 0.5,
      fieldConfidence: {} as Record<string, number>,
    }

    if (!result || typeof result !== 'object') {
      console.warn('[ReceiptClaimTool] Lambda returned no data, using defaults')
      return defaults
    }

    // The document processor Lambda returns: { success, document_id, extraction_result: { vendorName, totalAmount, ... } }
    const r = result as Record<string, unknown>
    console.log('[ReceiptClaimTool] Lambda response keys:', Object.keys(r))

    // Primary path: extraction_result (the actual Lambda response format)
    const extraction = (r.extraction_result || r.extractionResult || r.extraction || r.financial_data || r.financialData || r.data) as Record<string, unknown> | undefined

    if (extraction) {
      console.log('[ReceiptClaimTool] Found extraction data:', JSON.stringify(extraction).slice(0, 300))
      return {
        vendorName: String(extraction.vendorName || extraction.vendor_name || extraction.merchant || ''),
        totalAmount: Number(extraction.totalAmount || extraction.total_amount || extraction.amount || 0),
        currency: String(extraction.currency || extraction.original_currency || 'MYR'),
        transactionDate: String(extraction.transactionDate || extraction.transaction_date || extraction.date || defaults.transactionDate),
        category: String(extraction.suggestedCategory || extraction.suggested_category || extraction.category || 'General'),
        description: String(extraction.description || extraction.vendorName || ''),
        confidence: Number(extraction.confidence || r.confidence || 0.5),
        fieldConfidence: (extraction.fieldConfidence || extraction.field_confidence || {}) as Record<string, number>,
      }
    }

    // Fallback: try top-level fields (if Lambda returns flat structure)
    if (r.vendorName || r.vendor_name || r.merchant || r.totalAmount || r.total_amount) {
      console.log('[ReceiptClaimTool] Using top-level fields from response')
      return {
        vendorName: String(r.vendorName || r.vendor_name || r.merchant || ''),
        totalAmount: Number(r.totalAmount || r.total_amount || r.amount || 0),
        currency: String(r.currency || 'MYR'),
        transactionDate: String(r.transactionDate || r.transaction_date || r.date || defaults.transactionDate),
        category: String(r.suggestedCategory || r.suggested_category || r.category || 'General'),
        description: String(r.description || ''),
        confidence: Number(r.confidence || r.confidence_score || 0.5),
        fieldConfidence: (r.field_confidence || r.fieldConfidence || {}) as Record<string, number>,
      }
    }

    console.warn('[ReceiptClaimTool] Lambda result did not contain extractable financial data:', JSON.stringify(r).slice(0, 500))
    return defaults
  }

  private async checkDuplicate(
    extractedData: { vendorName: string; totalAmount: number; transactionDate: string; currency?: string },
    businessId: string,
    convexUserId?: string
  ): Promise<{ isDuplicate: boolean; existingClaimId?: string }> {
    // Skip if OCR didn't extract enough data
    if (!extractedData.vendorName || !extractedData.totalAmount || !convexUserId) {
      return { isDuplicate: false }
    }

    try {
      const { client } = await getAuthenticatedConvex()
      if (!client) return { isDuplicate: false }

      // Use the existing checkDuplicates query
      // Requires: businessId (Convex ID), userId (Convex ID), vendorName, transactionDate, totalAmount, currency
      const { api } = require('@/convex/_generated/api') as any // eslint-disable-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
      const results = await client.query(api.functions.expenseClaims.checkDuplicates, {
        businessId,
        userId: convexUserId,
        vendorName: extractedData.vendorName,
        transactionDate: extractedData.transactionDate,
        totalAmount: extractedData.totalAmount,
        currency: extractedData.currency || 'MYR',
      } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      // checkDuplicates returns an object with duplicates array
      const dupes = results?.duplicates || results
      if (dupes && Array.isArray(dupes) && dupes.length > 0) {
        return {
          isDuplicate: true,
          existingClaimId: dupes[0]?._id as string,
        }
      }
    } catch (err) {
      // Non-fatal: log and skip duplicate check
      console.warn('[ReceiptClaimTool] Duplicate check failed:', err instanceof Error ? err.message : err)
    }

    return { isDuplicate: false }
  }

  protected formatResultData(data: unknown[]): string {
    return JSON.stringify(data, null, 2)
  }

  private formatSingleResult(r: ReceiptClaimResult): string {
    let text = `I've processed your receipt and created a draft expense claim:\n\n`
    text += `**${r.merchant}** — ${r.currency} ${r.amount.toLocaleString()}\n`
    text += `Date: ${r.date} | Category: ${r.category}\n`

    if (r.lowConfidenceFields.length > 0) {
      text += `\n⚠️ I'm not fully confident about: ${r.lowConfidenceFields.join(', ')}. Please verify.`
    }

    if (r.duplicateWarning) {
      text += `\n\n⚠️ **Possible duplicate** — a similar claim with the same amount and merchant already exists.`
    }

    text += `\n\nYou can **Submit** the claim, **Edit** the details, or **Cancel** it.`
    return text
  }

  private formatBatchResult(results: ReceiptClaimResult[], errors: string[]): string {
    let text = `I've processed ${results.length} receipt${results.length > 1 ? 's' : ''} and created draft claims:\n\n`

    for (const r of results) {
      text += `• **${r.merchant}** — ${r.currency} ${r.amount.toLocaleString()} (${r.date})\n`
    }

    const total = results.reduce((sum, r) => sum + r.amount, 0)
    const currency = results[0]?.currency || 'MYR'
    text += `\n**Total: ${currency} ${total.toLocaleString()}**`

    if (errors.length > 0) {
      text += `\n\n⚠️ ${errors.length} receipt(s) failed: ${errors.join('; ')}`
    }

    text += `\n\nYou can **Submit All** or review individual claims.`
    return text
  }
}
