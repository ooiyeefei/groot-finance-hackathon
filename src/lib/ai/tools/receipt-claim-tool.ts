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
import { invokeDocumentProcessor } from '@/lib/lambda-invoker'
import { getAuthenticatedConvex } from '@/lib/convex'

interface ReceiptAttachment {
  s3Path: string
  mimeType: string
  filename: string
}

interface ReceiptClaimResult {
  claimId: string
  submissionId: string
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

    // Per-conversation batch grouping: all receipts from the same chat
    // conversation go into ONE submission (whether sent in 1 message or 10).
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
    const { api } = require('@/convex/_generated/api') as any
    const { client } = await getAuthenticatedConvex()
    if (!client) throw new Error('Could not connect to database')

    const conversationId = userContext.conversationId

    // Try to find an existing draft submission for this conversation
    let sharedSubmissionId: string | null = null
    if (conversationId) {
      sharedSubmissionId = await client.query(api.functions.expenseSubmissions.findByConversation, {
        conversationId,
      } as any)
    }

    // If no existing submission, create one
    if (!sharedSubmissionId) {
      const batchTitle = attachments.length > 1
        ? `Chat: ${attachments.length} receipts`
        : `Chat: ${attachments[0].filename}`
      sharedSubmissionId = await client.mutation(api.functions.expenseSubmissions.create, {
        businessId: userContext.businessId,
        title: batchTitle,
        conversationId,
      } as any)
    }

    for (const attachment of attachments) {
      try {
        const result = await this.processOneReceipt(attachment, userContext, businessPurpose, sharedSubmissionId!)
        results.push(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error processing receipt'
        errors.push(`${attachment.filename}: ${msg}`)
      }
    }

    // Update submission title to reflect content
    try {
      // Count total claims in the submission (including previously added ones)
      const allClaims = await client.query(api.functions.expenseClaims.listBySubmission, {
        submissionId: sharedSubmissionId,
      } as any)
      const claimCount = Array.isArray(allClaims) ? allClaims.length : results.length

      let newTitle: string
      if (claimCount === 1 && results.length === 1 && results[0].merchant && results[0].merchant !== 'Processing...') {
        newTitle = `Chat: ${results[0].merchant}`
      } else {
        newTitle = `Chat: ${claimCount} receipts`
      }
      await client.mutation(api.functions.expenseSubmissions.update, {
        id: sharedSubmissionId,
        title: newTitle,
      } as any)
    } catch { /* non-fatal */ }

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
    businessPurpose?: string,
    submissionId?: string
  ): Promise<ReceiptClaimResult> {
    const { userId, businessId } = userContext
    if (!businessId) throw new Error('Business context required')

    const fileType = attachment.mimeType === 'application/pdf' ? 'pdf' : 'image'

    // 1. Create claim FIRST (Lambda needs a documentId to update)
    // Submission is created at the batch level (executeInternal) and passed in
    const { client } = await getAuthenticatedConvex()
    if (!client) throw new Error('Could not connect to database')

    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
    const { api } = require('@/convex/_generated/api') as any

    // 1. Create the expense claim with status "uploading" (Lambda will update it)
    const createArgs = {
      businessId,
      vendorName: 'Processing...',
      totalAmount: 0,
      currency: 'MYR',
      transactionDate: new Date().toISOString().split('T')[0],
      expenseCategory: 'General',
      businessPurpose: businessPurpose || `Receipt: ${attachment.filename}`,
      status: 'uploading' as const,
      storagePath: attachment.s3Path,
      fileName: attachment.filename,
      fileType: attachment.mimeType,
      submissionId,
    }
    const claimId = await client.mutation(api.functions.expenseClaims.create, createArgs as any)
    console.log(`[ReceiptClaimTool] Created claim ${claimId} + submission ${submissionId}`)

    // 2. Invoke document processor Lambda ASYNC with the claimId as documentId
    // The Lambda will process the image and update the claim via Convex directly
    console.log(`[ReceiptClaimTool] Invoking doc processor (async) for ${attachment.filename}`)
    try {
      // The Lambda constructs S3 key as: {domain}/{storagePath}
      // Upload stores at: expense_claims/{businessId}/chat/{convId}/{uuid}.ext
      // Strip the 'expense_claims/' prefix since Lambda re-adds it
      const lambdaStoragePath = attachment.s3Path.replace(/^expense_claims\//, '')
      console.log(`[ReceiptClaimTool] Lambda storagePath: ${lambdaStoragePath} (original: ${attachment.s3Path})`)

      await invokeDocumentProcessor({
        documentId: String(claimId),
        domain: 'expense_claims',
        storagePath: lambdaStoragePath,
        fileType: fileType as 'pdf' | 'image',
        userId,
        businessId,
        idempotencyKey: `chat-receipt-${claimId}`,
        expectedDocumentType: 'receipt',
      })
    } catch (invokeErr) {
      console.error(`[ReceiptClaimTool] Lambda invocation failed:`, invokeErr)
      throw new Error(`Receipt processing failed: ${invokeErr instanceof Error ? invokeErr.message : 'Unknown error'}`)
    }

    // 3. Poll Convex for the Lambda to finish updating the claim
    const extractedData = await this.pollClaimForExtraction(client, api, claimId)

    // 4. Update the claim with extracted data (if Lambda populated it)
    if (extractedData.vendorName) {
      try {
        await client.mutation(api.functions.expenseClaims.update, {
          id: claimId,
          vendorName: extractedData.vendorName,
          totalAmount: extractedData.totalAmount,
          currency: extractedData.currency,
          transactionDate: extractedData.transactionDate,
          expenseCategory: extractedData.category,
          businessPurpose: businessPurpose || `Receipt: ${extractedData.vendorName}`,
          status: 'draft',
        } as any)
      } catch (updateErr) {
        console.warn('[ReceiptClaimTool] Failed to update claim with OCR data:', updateErr)
      }
    }

    // 5. Check for duplicates
    const duplicate = await this.checkDuplicate(extractedData, businessId, userContext.convexUserId)

    console.log(`[ReceiptClaimTool] Claim ${claimId} processed: ${extractedData.vendorName || 'Unknown'} ${extractedData.currency} ${extractedData.totalAmount}`)

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
      submissionId: submissionId as string,
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

  /**
   * Poll Convex for the Lambda to finish processing the expense claim.
   * The Lambda updates the claim's processingMetadata via convex.update_expense_claim_extraction().
   * We poll the claim record until it has vendor/amount data or timeout.
   */
  private async pollClaimForExtraction(
    client: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    api: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    claimId: string,
    maxWaitMs = 25000
  ): Promise<{
    vendorName: string
    totalAmount: number
    currency: string
    transactionDate: string
    category: string
    description: string
    confidence: number
    fieldConfidence: Record<string, number>
  }> {
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

    const startTime = Date.now()
    const pollInterval = 3000 // 3 seconds between polls

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))

      try {
        const claim = await client.query(api.functions.expenseClaims.getById, { id: claimId } as any)
        if (!claim) continue

        // Check if Lambda has updated the claim with vendor/amount data
        // The Lambda calls update_expense_claim_extraction which sets vendorName, totalAmount, etc.
        if (claim.vendorName && claim.vendorName !== 'Processing...' && claim.totalAmount > 0) {
          console.log(`[ReceiptClaimTool] OCR complete after ${Date.now() - startTime}ms: ${claim.vendorName} ${claim.currency} ${claim.totalAmount}`)
          return {
            vendorName: String(claim.vendorName || ''),
            totalAmount: Number(claim.totalAmount || 0),
            currency: String(claim.currency || 'MYR'),
            transactionDate: String(claim.transactionDate || defaults.transactionDate),
            category: String(claim.expenseCategory || 'General'),
            description: String(claim.businessPurpose || claim.description || ''),
            confidence: Number(claim.processingMetadata?.confidenceScore || claim.processingMetadata?.confidence || 0.8),
            fieldConfidence: (claim.processingMetadata?.fieldConfidence || {}) as Record<string, number>,
          }
        }

        // Also check processingMetadata for extraction data
        const meta = claim.processingMetadata
        if (meta?.financialData?.vendorName || meta?.financial_data?.vendor_name) {
          const fd = meta.financialData || meta.financial_data
          console.log(`[ReceiptClaimTool] OCR complete (from metadata) after ${Date.now() - startTime}ms`)
          return {
            vendorName: String(fd.vendorName || fd.vendor_name || ''),
            totalAmount: Number(fd.totalAmount || fd.total_amount || 0),
            currency: String(fd.currency || fd.originalCurrency || fd.original_currency || 'MYR'),
            transactionDate: String(fd.transactionDate || fd.transaction_date || defaults.transactionDate),
            category: String(meta.categoryMapping?.accountingCategory || meta.category_mapping?.accounting_category || 'General'),
            description: String(fd.description || ''),
            confidence: Number(meta.confidenceScore || meta.confidence_score || 0.8),
            fieldConfidence: (meta.fieldConfidence || meta.field_confidence || {}) as Record<string, number>,
          }
        }

        console.log(`[ReceiptClaimTool] Polling... claim status: ${claim.status}, vendorName: ${claim.vendorName}, elapsed: ${Date.now() - startTime}ms`)
      } catch (pollErr) {
        console.warn('[ReceiptClaimTool] Poll error:', pollErr instanceof Error ? pollErr.message : pollErr)
      }
    }

    console.warn(`[ReceiptClaimTool] OCR polling timed out after ${maxWaitMs}ms for claim ${claimId}`)
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
