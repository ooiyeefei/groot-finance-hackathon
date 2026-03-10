/**
 * North Star Expense Claims Domain Actions
 * Consolidated business logic for all expense claim operations
 *
 * Migrated to Convex from Supabase
 * File storage uses AWS S3
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { currencyService } from '@/lib/services/currency-service'
import { roundCurrency } from '@/lib/utils/format-number'
import { StoragePathBuilder, type DocumentType } from '@/lib/storage-paths'
import { invokeDocumentProcessor } from '@/lib/lambda-invoker'
import {
  ExpenseClaim,
  ExpenseClaimStatus,
  CreateExpenseClaimRequest,
  UpdateExpenseClaimRequest,
  ExpenseClaimListParams,
  ValidationResult
} from '../types'
import {
  mapExpenseCategoryToAccounting,
  getBusinessExpenseCategory,
  isValidExpenseCategory
} from '@/domains/expense-claims/lib/expense-category-mapper'
import {
  canSubmitOwnClaim,
  canApproveExpenseClaims,
  canProcessReimbursements,
  canRecallOwnClaim,
  canReviseOwnClaim,
  canFilterByUserId
} from '@/domains/security/lib/rbac'

// AWS S3 storage client
import { uploadFile, getMimeType } from '@/lib/aws-s3'

// File upload constants
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * Find appropriate approver using manager hierarchy with enhanced routing logic
 * Uses Convex query for database access
 */
async function findNextApprover(
  submittingUserId: string,
  businessId: string,
  convexClient: any
): Promise<string | null> {
  try {
    console.log(`[Approver Routing] Finding approver for user ${submittingUserId} in business ${businessId}`)

    // Use Convex query to find next approver
    const approver = await convexClient.query(api.functions.expenseClaims.findNextApprover, {
      businessId,
      submitterId: submittingUserId
    })

    if (approver) {
      console.log(`[Approver Routing] Found approver: ${approver._id}`)
      return approver._id
    }

    console.log(`[Approver Routing] No approver found - all methods exhausted`)
    return null

  } catch (error) {
    console.error('[Approver Routing] Unexpected error:', error)
    return null
  }
}

/**
 * Get user data from Convex
 */
async function getUserData(userId: string, convexClient: any) {
  const user = await convexClient.query(api.functions.users.getCurrentUser, {})
  return {
    home_currency: user?.homeCurrency || 'MYR'
  }
}

/**
 * Check if employee can submit expense claims
 * Employees MUST have a manager assigned before they can submit
 * Managers/Admins/Owners can always submit (may self-approve)
 */
async function canEmployeeSubmit(
  userId: string,
  businessId: string,
  convexClient: any
): Promise<{ canSubmit: boolean; error?: string }> {
  try {
    const membership = await convexClient.query(api.functions.memberships.getByUserAndBusiness, {
      userId,
      businessId
    })

    if (!membership) {
      return { canSubmit: false, error: 'User is not a member of this business' }
    }

    // Managers, finance_admins, and owners can always submit (may self-approve)
    if (membership.role !== 'employee') {
      return { canSubmit: true }
    }

    // Employees MUST have a manager assigned
    if (!membership.managerId) {
      return {
        canSubmit: false,
        error: 'MANAGER_REQUIRED'
      }
    }

    return { canSubmit: true }
  } catch (error) {
    console.error('[Submission Check] Error checking employee submission eligibility:', error)
    return { canSubmit: false, error: 'Failed to verify submission eligibility' }
  }
}

/**
 * Create new expense claim
 */
export async function createExpenseClaim(
  userId: string,
  request: CreateExpenseClaimRequest
): Promise<{ success: boolean; data?: ExpenseClaim; error?: string; task_id?: string }> {
  try {
    // Get Convex client
    const { client: convexClient } = await getAuthenticatedConvex()
    if (!convexClient) {
      return { success: false, error: 'Failed to get Convex client' }
    }

    // Get user data and ensure profile
    const userData = await getUserData(userId, convexClient)
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      return { success: false, error: 'Failed to retrieve employee profile' }
    }

    // Handle file upload if present
    let documentId: string | undefined
    let standardizedFilePath: string | undefined
    let triggerResult: any

    if (request.file && request.processing_mode) {
      // Validate file
      if (!SUPPORTED_TYPES.includes(request.file.type)) {
        return { success: false, error: 'Unsupported file type. Please upload JPEG, PNG, WebP, or PDF files.' }
      }

      if (request.file.size > MAX_FILE_SIZE) {
        return { success: false, error: 'File size exceeds 10MB limit' }
      }

      documentId = crypto.randomUUID()
    }

    // Validate required fields for manual creation
    const {
      description,
      business_purpose,
      expense_category,
      original_amount,
      original_currency,
      transaction_date,
      vendor_name,
      vendor_id,
      reference_number,
      notes,
      storage_path,
      line_items = []
    } = request

    if (!description || !business_purpose ||
        (original_amount === null || original_amount === undefined) ||
        !original_currency || !transaction_date) {
      return { success: false, error: 'Missing required fields' }
    }

    // Validate currency
    if (!currencyService.isSupportedCurrency(original_currency)) {
      return { success: false, error: `Unsupported currency: ${original_currency}` }
    }

    // Validate expense category only if provided (Lambda job will determine if null)
    if (expense_category) {
      const isValidCategory = await isValidExpenseCategory(employeeProfile.business_id, expense_category)
      if (!isValidCategory) {
        return { success: false, error: `Invalid expense category: ${expense_category}` }
      }
    }

    // Get category info for accounting mapping (only if category provided)
    let categoryInfo = null
    let accountingCategory = null

    if (expense_category) {
      categoryInfo = await getBusinessExpenseCategory(employeeProfile.business_id, expense_category)
      accountingCategory = categoryInfo?.accounting_category || mapExpenseCategoryToAccounting(expense_category)
    }

    // TWO-LEVEL CURRENCY CONVERSION
    const businessHomeCurrency = request.business_home_currency || userData.home_currency
    let homeAmount = original_amount
    let exchangeRate = 1
    let exchangeRateDate = new Date().toISOString().split('T')[0]

    console.log(`[Currency Conversion] Converting ${original_amount} ${original_currency} to business currency ${businessHomeCurrency}`)

    if (original_currency !== businessHomeCurrency) {
      try {
        const conversion = await currencyService.convertAmount(
          original_amount,
          original_currency,
          businessHomeCurrency as any
        )
        homeAmount = conversion.converted_amount
        exchangeRate = conversion.exchange_rate
        exchangeRateDate = conversion.rate_date

        console.log(`[Currency Conversion] Converted: ${original_amount} ${original_currency} = ${homeAmount} ${businessHomeCurrency} (rate: ${exchangeRate})`)
      } catch (error) {
        console.error('[Currency Conversion] Currency conversion failed:', error)
      }
    } else {
      console.log(`[Currency Conversion] No conversion needed (same currency: ${original_currency})`)
    }

    // Server-side duplicate detection using Convex
    if (reference_number) {
      const existingClaims = await convexClient.query(api.functions.expenseClaims.list, {
        businessId: employeeProfile.business_id
      })

      const duplicate = existingClaims?.claims?.find((claim: any) =>
        claim.userId === employeeProfile.user_id &&
        claim.referenceNumber === reference_number &&
        claim.transactionDate === transaction_date &&
        claim.totalAmount === original_amount
      )

      if (duplicate) {
        // Check if user has acknowledged the duplicate and wants to proceed
        if (request.duplicateOverride) {
          // AUDIT: User acknowledged duplicate and proceeded
          console.log('[Duplicate Detection] AUDIT: User acknowledged duplicate and proceeded', {
            user_id: employeeProfile.user_id,
            business_id: employeeProfile.business_id,
            acknowledged_claim_ids: request.duplicateOverride.acknowledgedDuplicates,
            reason: request.duplicateOverride.reason,
            is_split_expense: request.duplicateOverride.isSplitExpense,
            timestamp: new Date().toISOString()
          })
          // Continue with expense claim creation (don't block)
        } else {
          // AUDIT: Duplicate detected and blocked
          console.log('[Duplicate Detection] AUDIT: Duplicate detected and blocked', {
            user_id: employeeProfile.user_id,
            business_id: employeeProfile.business_id,
            duplicate_claim_id: duplicate._id,
            reference_number,
            transaction_date,
            amount: original_amount,
            timestamp: new Date().toISOString()
          })

          return {
            success: false,
            error: 'duplicate_detected',
            data: {
              claimId: duplicate._id,
              reference_number: duplicate.referenceNumber,
              transaction_date: duplicate.transactionDate,
              amount: duplicate.totalAmount,
              vendor_name: duplicate.vendorName,
              status: duplicate.status,
              created_at: duplicate._creationTime
            } as any
          }
        }
      }
    }

    // Build processing metadata
    const processingMetadata = {
      processing_method: request.file ? request.processing_mode : 'manual_entry',
      status: request.file ? 'uploading' : 'completed',
      processing_timestamp: new Date().toISOString(),
      document_id: documentId,
      original_filename: request.file?.name,
      file_size: request.file?.size,
      file_type: request.file?.type,

      financial_data: {
        description,
        vendor_name,
        vendor_id: vendor_id || null,
        total_amount: original_amount,
        original_currency,
        home_currency: businessHomeCurrency,
        home_currency_amount: homeAmount,
        exchange_rate: exchangeRate,
        exchange_rate_date: exchangeRateDate,
        transaction_date,
        reference_number: reference_number || null,
        notes: notes || null,
        business_purpose_details: notes || null,
        subtotal_amount: null,
        tax_amount: null
      },

      line_items: line_items.map((item, index) => ({
        item_description: item.description,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_amount: roundCurrency(item.quantity * item.unit_price),
        currency: original_currency,
        tax_amount: item.tax_rate ? roundCurrency(item.quantity * item.unit_price * item.tax_rate) : 0,
        tax_rate: item.tax_rate || 0,
        line_order: index + 1
      })),

      category_mapping: {
        business_category: expense_category,
        accounting_category: accountingCategory,
        category_name: categoryInfo?.business_category_name
      },

      employee_profile_id: employeeProfile.id,
      created_via: 'expense_claims_api_v1',

      // Duplicate override metadata (if user acknowledged duplicates)
      ...(request.duplicateOverride ? {
        duplicate_override: {
          acknowledged_duplicates: request.duplicateOverride.acknowledgedDuplicates,
          reason: request.duplicateOverride.reason,
          is_split_expense: request.duplicateOverride.isSplitExpense,
          override_timestamp: new Date().toISOString()
        }
      } : {})
    }

    // Log expense claim creation
    console.log('[DEBUG] Creating expense claim:', {
      user_id: employeeProfile.user_id,
      business_id: employeeProfile.business_id,
      status: request.file ? 'uploading' : 'draft',
      currency: original_currency,
      amount_present: !!original_amount,
      has_file: !!request.file
    })

    // Create expense claim using Convex mutation
    const claimId = await convexClient.mutation(api.functions.expenseClaims.create, {
      businessId: employeeProfile.business_id,
      businessPurpose: business_purpose,
      description: description,
      vendorName: vendor_name,
      totalAmount: original_amount,
      currency: original_currency,
      homeCurrency: businessHomeCurrency,
      homeCurrencyAmount: homeAmount,
      exchangeRate: exchangeRate,
      transactionDate: transaction_date,
      referenceNumber: reference_number || undefined,
      expenseCategory: expense_category || undefined,
      storagePath: storage_path || undefined,
      fileName: request.file?.name,
      fileType: request.file?.type,
      fileSize: request.file?.size,
      status: request.file ? 'uploading' : 'draft',
      // Link to expense submission (batch receipt submission)
      ...(request.submissionId ? { submissionId: request.submissionId as any } : {}),
      // Duplicate override fields (if user acknowledged duplicates)
      ...(request.duplicateOverride ? {
        duplicateStatus: 'dismissed' as const,
        duplicateOverrideReason: request.duplicateOverride.reason,
        duplicateOverrideAt: Date.now(),
        isSplitExpense: request.duplicateOverride.isSplitExpense
      } : {})
    })

    // Get the created claim
    const expenseClaim = await convexClient.query(api.functions.expenseClaims.getById, {
      id: claimId
    })

    // Update with processing metadata
    await convexClient.mutation(api.functions.expenseClaims.update, {
      id: claimId,
      processingMetadata: processingMetadata
    })

    // Handle file upload if present (using AWS S3)
    if (request.file && documentId) {
      // Generate storage path using Convex ID for consistent paths
      // Pattern: expense_claims/{businessId}/{userId}/{claimId}/raw/{claimId}.{ext}
      const storageBuilder = new StoragePathBuilder(
        employeeProfile.business_id,
        employeeProfile.user_id,
        claimId
      )
      const fileExtension = request.file.name.split('.').pop() || 'unknown'
      const filename = `${claimId}.${fileExtension}`
      standardizedFilePath = storageBuilder.forDocument('expense_receipts' as DocumentType).raw(filename)

      // Upload file to AWS S3
      const uploadResult = await uploadFile(
        'expense_claims',
        standardizedFilePath,
        request.file,
        getMimeType(request.file.name)
      )

      if (!uploadResult.success) {
        // Update record with failure status
        await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
          id: claimId,
          status: 'failed'
        })
        await convexClient.mutation(api.functions.expenseClaims.update, {
          id: claimId,
          processingMetadata: {
            ...processingMetadata,
            status: 'upload_failed',
            error_message: uploadResult.error || 'Upload failed',
            error_timestamp: new Date().toISOString()
          }
        })

        return { success: false, error: 'Failed to upload file to storage' }
      }

      // Update claim with successful upload
      const newStatus = request.processing_mode === 'ai' ? 'processing' : 'draft'
      await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
        id: claimId,
        status: newStatus as any
      })
      await convexClient.mutation(api.functions.expenseClaims.update, {
        id: claimId,
        storagePath: standardizedFilePath,
        processingMetadata: {
          ...processingMetadata,
          storage_path: standardizedFilePath,
          upload_timestamp: new Date().toISOString(),
          status: request.processing_mode === 'ai' ? 'analyzing' : 'draft'
        }
      })

      // Trigger Lambda processing for AI mode
      if (request.processing_mode === 'ai') {
        try {
          const fileType = request.file.type === 'application/pdf' ? 'pdf' : 'image'
          console.log(`[Lambda Processing] Triggering document processor for expense claim: ${claimId} (${fileType})`)

          // Fetch business + user details for e-invoice form fill (019-lhdn-einv-flow-2)
          // Passed upfront so Lambda can trigger form fill without round-tripping to Convex
          let businessDetails: { name: string; tin: string; brn: string; address: string; phone?: string; contactEmail?: string; [key: string]: any } | undefined
          try {
            const business = await convexClient.query(api.functions.businesses.getBusinessProfileByStringId, {
              businessId: employeeProfile.business_id,
            })
            // Get user's full name from Clerk
            const clerk = (await import('@clerk/nextjs/server')).default || await import('@clerk/nextjs/server')
            const clerkClient = (clerk as any).clerkClient || clerk
            const clerkInstance = typeof clerkClient === 'function' ? await clerkClient() : clerkClient
            let userName = business?.name || 'User'
            try {
              const clerkUser = await clerkInstance.users.getUser(userId)
              userName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || userName
            } catch { /* fallback to business name */ }

            if (business?.lhdn_tin) {
              businessDetails = {
                name: business.name,
                userName, // User's personal name for "Full Name" field
                tin: business.lhdn_tin,
                brn: business.business_registration_number || business.lhdn_tin,
                // Structured address for state/city dropdowns
                addressLine1: business.address_line1,
                addressLine2: business.address_line2 || '',
                city: business.city || '',
                stateCode: business.state_code || '',
                postalCode: business.postal_code || '',
                countryCode: business.country_code || 'MY',
                address: [business.address_line1, business.address_line2, business.city, business.state_code].filter(Boolean).join(', '),
                phone: business.contact_phone || '+60132201176', // Default phone
                contactEmail: business.contact_email || undefined,
              }
            }
          } catch {
            // Non-fatal: business details are optional (only needed for e-invoice)
            console.log('[Lambda Processing] Could not fetch business details for e-invoice (non-fatal)')
          }

          const lambdaResult = await invokeDocumentProcessor({
            documentId: claimId,
            domain: 'expense_claims',
            storagePath: standardizedFilePath,
            fileType: fileType as 'pdf' | 'image',
            userId: employeeProfile.user_id,
            businessId: employeeProfile.business_id,
            idempotencyKey: `expense-${claimId}-${Date.now()}`,
            expectedDocumentType: 'receipt',
            businessDetails,
          })

          await convexClient.mutation(api.functions.expenseClaims.update, {
            id: claimId,
            processingMetadata: {
              ...processingMetadata,
              lambda_execution_id: lambdaResult.executionId,
              lambda_request_id: lambdaResult.requestId,
              processing_timestamp: new Date().toISOString(),
              processing_stage: 'lambda_invoked'
            }
          })

          console.log(`[Lambda Processing] Lambda invoked successfully: ${lambdaResult.executionId}`)
          triggerResult = { id: lambdaResult.executionId }

        } catch (lambdaError) {
          console.error('Failed to invoke Lambda:', lambdaError)
          await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
            id: claimId,
            status: 'failed'
          })
          await convexClient.mutation(api.functions.expenseClaims.update, {
            id: claimId,
            processingMetadata: {
              ...processingMetadata,
              status: 'failed',
              error_message: 'Failed to invoke document processing Lambda',
              error_timestamp: new Date().toISOString()
            }
          })
        }
      }
    }

    return {
      success: true,
      data: expenseClaim as any,
      task_id: triggerResult?.id
    }

  } catch (error) {
    console.error('Failed to create expense claim:', error)
    return { success: false, error: 'Failed to create expense claim' }
  }
}

/**
 * List expense claims with filtering and pagination
 */
export async function listExpenseClaims(
  userId: string,
  params: ExpenseClaimListParams
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const employeeProfile = await ensureUserProfile(userId)
    if (!employeeProfile) {
      return { success: false, error: 'Failed to get employee profile' }
    }

    const { client: convexClient } = await getAuthenticatedConvex()
    if (!convexClient) {
      return { success: false, error: 'Failed to get Convex client' }
    }

    const isAdmin = employeeProfile.role_permissions.finance_admin
    const isManager = employeeProfile.role_permissions.manager

    // Use getPendingApprovals for approval queue (approver=me), general list otherwise
    // This ensures managers only see claims they should approve, not all their own claims
    let result: any
    if (params.approver === 'me' && (isAdmin || isManager)) {
      // Use getPendingApprovals for proper approval queue filtering:
      // - Managers: only direct reports' claims
      // - Admins/Owners: all submitted claims
      const pendingClaims = await convexClient.query(api.functions.expenseClaims.getPendingApprovals, {
        businessId: employeeProfile.business_id
      })
      result = {
        claims: pendingClaims || [],
        totalCount: pendingClaims?.length || 0,
        nextCursor: null
      }
    } else {
      // Use general list query for all other cases
      result = await convexClient.query(api.functions.expenseClaims.list, {
        businessId: employeeProfile.business_id,
        status: params.status,
        userId: params.user_id ? params.user_id : undefined,
        startDate: params.date_from,
        endDate: params.date_to,
        limit: params.limit || 20,
        cursor: params.page ? String((params.page - 1) * (params.limit || 20)) : undefined
      })
    }

    if (!result) {
      return { success: false, error: 'Failed to fetch expense claims' }
    }

    // Transform response to match expected format
    const transformedClaims = (result.claims || []).map((claim: any) => ({
      ...claim,
      id: claim._id,
      user_id: claim.userId,
      business_id: claim.businessId,
      business_purpose: claim.businessPurpose,
      expense_category: claim.expenseCategory,
      total_amount: claim.totalAmount,
      home_currency_amount: claim.homeCurrencyAmount,
      home_currency: claim.homeCurrency,
      transaction_date: claim.transactionDate,
      vendor_name: claim.vendorName,
      reference_number: claim.referenceNumber,
      storage_path: claim.storagePath,
      file_name: claim.fileName,
      file_type: claim.fileType,
      file_size: claim.fileSize,
      processing_metadata: claim.processingMetadata,
      reviewed_by: claim.reviewedBy,
      reviewer_notes: claim.reviewerNotes,
      submitted_at: claim.submittedAt,
      approved_at: claim.approvedAt,
      rejected_at: claim.rejectedAt,
      paid_at: claim.paidAt,
      created_at: claim._creationTime,
      updated_at: claim.updatedAt,
      employee: claim.submitter ? {
        id: claim.submitter._id,
        full_name: claim.submitter.fullName,
        email: claim.submitter.email
      } : null
    }))

    const page = params.page || 1
    const limit = params.limit || 20
    const totalCount = result.totalCount || 0
    const hasMore = result.nextCursor !== null

    const responseData: any = {
      claims: transformedClaims,
      pagination: {
        page,
        limit,
        total: totalCount,
        has_more: hasMore,
        total_pages: Math.ceil(totalCount / limit)
      }
    }

    // Add summary for management dashboard
    if (params.approver === 'me' && (isAdmin || isManager)) {
      // Pre-submission statuses to exclude from manager analytics
      // These claims haven't entered the approval workflow yet
      const preSubmissionStatuses = ['draft', 'uploading', 'processing', 'failed']
      const submittedClaims = transformedClaims.filter(
        (c: any) => !preSubmissionStatuses.includes(c.status)
      )

      const summary = {
        total_claims: submittedClaims.length,
        pending_approval: transformedClaims.filter((c: any) => c.status === 'submitted').length,
        approved_amount: transformedClaims
          .filter((c: any) => c.status === 'approved' || c.status === 'reimbursed')
          .reduce((sum: number, c: any) => sum + (c.home_currency_amount || 0), 0),
        rejected_count: transformedClaims.filter((c: any) => c.status === 'rejected').length
      }

      responseData.summary = summary
      responseData.role = {
        employee: true,
        manager: isManager,
        admin: isAdmin
      }
      responseData.recent_claims = transformedClaims
    }

    return {
      success: true,
      data: responseData
    }

  } catch (error) {
    console.error('Failed to list expense claims:', error)
    return { success: false, error: 'Failed to fetch expense claims' }
  }
}

/**
 * Get single expense claim
 */
export async function getExpenseClaim(
  userId: string,
  claimId: string
): Promise<{ success: boolean; data?: ExpenseClaim; error?: string }> {
  try {
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return { success: false, error: 'Failed to get user profile' }
    }

    const { client: convexClient } = await getAuthenticatedConvex()
    if (!convexClient) {
      return { success: false, error: 'Failed to get Convex client' }
    }

    // Fetch the expense claim using Convex
    const claim = await convexClient.query(api.functions.expenseClaims.getById, {
      id: claimId
    })

    // DEBUG: Log raw Convex data
    console.log('[getExpenseClaim] RAW CONVEX DATA:', {
      claimId,
      expenseCategory: claim?.expenseCategory,
      processingMetadata_category: claim?.processingMetadata?.category_mapping?.business_category,
      processingMetadata_expense_category: claim?.processingMetadata?.expense_category
    })

    if (!claim) {
      return { success: false, error: 'Expense claim not found or access denied' }
    }

    // Transform data to include transaction interface
    const transformedClaim = {
      ...claim,
      id: claim._id,
      user_id: claim.userId,
      business_id: claim.businessId,
      business_purpose: claim.businessPurpose,
      expense_category: claim.expenseCategory,
      total_amount: claim.totalAmount,
      currency: claim.currency,
      home_currency_amount: claim.homeCurrencyAmount,
      home_currency: claim.homeCurrency,
      transaction_date: claim.transactionDate,
      vendor_name: claim.vendorName,
      reference_number: claim.referenceNumber,
      storage_path: claim.storagePath,
      processing_metadata: claim.processingMetadata,
      extracted_data: claim.processingMetadata || null,
      transaction: {
        id: claim.accountingEntryId,
        description: claim.description,
        original_amount: claim.totalAmount,
        original_currency: claim.currency,
        home_currency_amount: claim.homeCurrencyAmount || claim.totalAmount,
        home_currency: claim.homeCurrency || claim.currency,
        transaction_date: claim.transactionDate,
        vendor_name: claim.vendorName,
        vendor_id: null,
        reference_number: claim.processingMetadata?.financial_data?.reference_number || null,
        notes: null,
        processing_metadata: claim.processingMetadata,
        business_purpose: claim.businessPurpose,
        expense_category: claim.expenseCategory,
        line_items: claim.processingMetadata?.line_items?.map((item: any, index: number) => ({
          id: `temp-${index}`,
          item_description: item.description || item.item_description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_amount: item.line_total || item.total_amount || 0
        })) || []
      }
    }

    // Fetch e-invoice status (includes pendingMatchCandidates)
    if (claim.merchantFormUrl || claim.einvoiceRequestStatus || claim.einvoiceAttached) {
      try {
        const einvoiceStatus = await convexClient.query(api.functions.expenseClaims.getEinvoiceStatus, {
          claimId,
        });
        if (einvoiceStatus) {
          (transformedClaim as any).pendingMatchCandidates = einvoiceStatus.pendingMatchCandidates;
        }
      } catch (einvoiceError) {
        // Non-fatal: don't fail the whole request if e-invoice status fails
        console.error('[getExpenseClaim] Failed to fetch e-invoice status:', einvoiceError);
      }
    }

    return { success: true, data: transformedClaim as any }

  } catch (error) {
    console.error('Failed to get expense claim:', error)
    return { success: false, error: 'Internal server error' }
  }
}

/**
 * Update expense claim (unified for field updates and status changes)
 */
export async function updateExpenseClaim(
  userId: string,
  claimId: string,
  request: UpdateExpenseClaimRequest
): Promise<{ success: boolean; data?: ExpenseClaim; error?: string }> {
  try {
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return { success: false, error: 'Failed to get employee profile' }
    }

    const { client: convexClient } = await getAuthenticatedConvex()
    if (!convexClient) {
      return { success: false, error: 'Failed to get Convex client' }
    }

    // Fetch existing claim using Convex
    const existingClaim = await convexClient.query(api.functions.expenseClaims.getById, {
      id: claimId
    })

    if (!existingClaim) {
      return { success: false, error: 'Expense claim not found or access denied' }
    }

    // Handle status changes
    if (request.status && request.status !== existingClaim.status) {
      // Check RBAC permissions for specific transitions
      let hasPermission = false
      let permissionError = ''

      switch (request.status) {
        case 'submitted':
          if (existingClaim.userId === userProfile.user_id) {
            hasPermission = await canSubmitOwnClaim()
            permissionError = 'You do not have permission to submit expense claims'
          } else {
            hasPermission = false
            permissionError = 'You can only submit your own expense claims'
          }
          break

        case 'approved':
        case 'rejected':
          hasPermission = await canApproveExpenseClaims()
          permissionError = 'You do not have permission to approve or reject expense claims'
          break

        case 'reimbursed':
          hasPermission = await canProcessReimbursements()
          permissionError = 'You do not have permission to process reimbursements'
          break

        case 'draft':
          if (existingClaim.userId === userProfile.user_id) {
            if (existingClaim.status === 'submitted') {
              hasPermission = await canRecallOwnClaim()
              permissionError = 'You do not have permission to recall submitted claims'
            } else if (existingClaim.status === 'rejected') {
              hasPermission = await canReviseOwnClaim()
              permissionError = 'You do not have permission to revise rejected claims'
            }
          } else {
            hasPermission = false
            permissionError = 'You can only recall/revise your own expense claims'
          }
          break

        default:
          hasPermission = false
          permissionError = `Permission check not implemented for status: ${request.status}`
      }

      if (!hasPermission) {
        return { success: false, error: permissionError }
      }

      // Apply status-specific business logic
      const now = new Date().toISOString()

      switch (request.status) {
        case 'submitted':
          // Check if employee can submit (must have manager assigned)
          const submissionCheck = await canEmployeeSubmit(
            existingClaim.userId,
            userProfile.business_id,
            convexClient
          )

          if (!submissionCheck.canSubmit) {
            if (submissionCheck.error === 'MANAGER_REQUIRED') {
              return {
                success: false,
                error: 'You cannot submit expense claims without an assigned manager. Please contact your administrator to assign you a manager.'
              }
            }
            return { success: false, error: submissionCheck.error || 'Submission not allowed' }
          }

          // Find next approver using Convex
          const nextApproverId = await findNextApprover(
            existingClaim.userId,
            userProfile.business_id,
            convexClient
          )

          console.log(`[Expense Submission] Expense claim ${claimId} submitted by user ${existingClaim.userId}, routed to approver: ${nextApproverId}`)

          // Update status and set reviewer
          await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
            id: claimId,
            status: 'submitted'
          })

          // Update additional fields
          const existingMetadata = existingClaim.processingMetadata || {}
          await convexClient.mutation(api.functions.expenseClaims.update, {
            id: claimId,
            processingMetadata: {
              ...existingMetadata,
              submitted_at: now,
              reviewed_by: nextApproverId
            }
          })
          break

        case 'approved':
          console.log(`[RPC Approval] Approving expense claim: ${claimId}`)

          // Update status - this sets approvedBy, approvedAt, and reviewerNotes
          await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
            id: claimId,
            status: 'approved',
            reviewerNotes: request.comment
          })
          // Note: Accounting entry creation should be handled by a separate Convex mutation
          // The updateStatus mutation already records approval metadata (approvedBy, approvedAt)
          break

        case 'rejected':
          await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
            id: claimId,
            status: 'rejected',
            reviewerNotes: request.comment || request.reviewer_notes || 'No reason provided'
          })
          break

        case 'reimbursed':
          await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
            id: claimId,
            status: 'reimbursed',
            reviewerNotes: request.comment
          })

          // Update accounting entry if exists
          if (existingClaim.accountingEntryId) {
            // Note: This would need a Convex mutation for accounting_entries
            console.log(`[Reimbursement] Accounting entry ${existingClaim.accountingEntryId} marked as paid`)
          }
          break

        case 'draft':
          await convexClient.mutation(api.functions.expenseClaims.updateStatus, {
            id: claimId,
            status: 'draft'
          })

          // Reset workflow metadata
          const resetMetadata = existingClaim.processingMetadata || {}
          await convexClient.mutation(api.functions.expenseClaims.update, {
            id: claimId,
            processingMetadata: {
              ...resetMetadata,
              submitted_at: null,
              approved_at: null,
              rejected_at: null,
              paid_at: null,
              reviewed_by: null,
              reviewer_notes: null
            }
          })
          break
      }

      return await getExpenseClaim(userId, claimId)
    }

    // Handle field updates (only for draft claims)
    if (existingClaim.status !== 'draft') {
      return { success: false, error: 'Cannot edit expense claims that have been submitted' }
    }

    // Get user's home currency for conversion
    const userData = await getUserData(userId, convexClient)
    const userHomeCurrency = userData.home_currency

    // Convert to home currency if different
    let homeAmount = request.original_amount || existingClaim.totalAmount
    let exchangeRate = 1

    if (request.original_currency && request.original_amount &&
        request.original_currency !== userHomeCurrency) {
      try {
        const conversion = await currencyService.convertAmount(
          request.original_amount,
          request.original_currency,
          userHomeCurrency as any
        )
        homeAmount = conversion.converted_amount
        exchangeRate = conversion.exchange_rate
      } catch (error) {
        console.error('Currency conversion failed:', error)
      }
    }

    // Prepare update data
    const updateData: any = {}

    if (request.description !== undefined) updateData.description = request.description
    if (request.vendor_name !== undefined) updateData.vendorName = request.vendor_name
    if (request.original_amount !== undefined) updateData.totalAmount = request.original_amount
    if (request.original_currency !== undefined) updateData.currency = request.original_currency
    if (request.transaction_date !== undefined) updateData.transactionDate = request.transaction_date
    if (request.business_purpose !== undefined) updateData.businessPurpose = request.business_purpose
    if (request.expense_category !== undefined) updateData.expenseCategory = request.expense_category
    if (request.reference_number !== undefined) updateData.referenceNumber = request.reference_number

    // Update currency fields
    if (request.original_currency || request.original_amount) {
      updateData.homeCurrency = userHomeCurrency
      updateData.homeCurrencyAmount = homeAmount
      updateData.exchangeRate = exchangeRate
    }

    // Handle line items updates in processing_metadata
    if (request.line_items && Array.isArray(request.line_items)) {
      const existingMetadata = existingClaim.processingMetadata || {}

      const updatedLineItems = request.line_items.map((item: any, index: number) => ({
        item_description: item.description || item.item_description || 'Item',
        description: item.description || item.item_description || 'Item',
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total_amount: item.total_amount || 0,
        currency: request.original_currency || existingClaim.currency,
        tax_amount: item.tax_amount || 0,
        tax_rate: item.tax_rate || 0,
        line_order: index + 1
      }))

      updateData.processingMetadata = {
        ...existingMetadata,
        line_items: updatedLineItems,
        last_updated: new Date().toISOString(),
        update_source: 'manual_edit_v1'
      }
    }

    // Apply field update using Convex
    await convexClient.mutation(api.functions.expenseClaims.update, {
      id: claimId,
      ...updateData
    })

    return await getExpenseClaim(userId, claimId)

  } catch (error) {
    console.error('Failed to update expense claim:', error)
    return { success: false, error: 'Internal server error' }
  }
}

/**
 * Delete expense claim (draft only)
 */
export async function deleteExpenseClaim(
  userId: string,
  claimId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return { success: false, error: 'Failed to get employee profile' }
    }

    const { client: convexClient } = await getAuthenticatedConvex()
    if (!convexClient) {
      return { success: false, error: 'Failed to get Convex client' }
    }

    // Fetch existing claim using Convex
    const existingClaim = await convexClient.query(api.functions.expenseClaims.getById, {
      id: claimId
    })

    if (!existingClaim) {
      return { success: false, error: 'Expense claim not found or access denied' }
    }

    // Allow deleting draft, failed, and classification_failed claims
    const deletableStatuses = ['draft', 'failed', 'classification_failed']
    if (!deletableStatuses.includes(existingClaim.status)) {
      return { success: false, error: 'Only draft or failed expense claims can be deleted' }
    }

    // Soft delete using Convex mutation
    await convexClient.mutation(api.functions.expenseClaims.softDelete, {
      id: claimId
    })

    return { success: true, message: 'Expense claim deleted successfully' }

  } catch (error) {
    console.error('Failed to delete expense claim:', error)
    return { success: false, error: 'Internal server error' }
  }
}

/**
 * Get expense analytics for dashboard
 */
export async function getExpenseAnalytics(
  userId: string,
  scope: 'personal' | 'department' | 'company'
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const employeeProfile = await ensureUserProfile(userId)
    if (!employeeProfile) {
      return { success: false, error: 'Failed to get employee profile' }
    }

    const { client: convexClient } = await getAuthenticatedConvex()
    if (!convexClient) {
      return { success: false, error: 'Failed to get Convex client' }
    }

    const isAdmin = employeeProfile.role_permissions.finance_admin
    const isManager = employeeProfile.role_permissions.manager

    // Use Convex analytics query
    const analytics = await convexClient.query(api.functions.expenseClaims.getAnalytics, {
      businessId: employeeProfile.business_id
    })

    // Fetch expense categories for name resolution
    const expenseCategories = await convexClient.query(api.functions.businesses.getExpenseCategories, {
      businessId: employeeProfile.business_id
    })

    // Build category name lookup map (case-insensitive keys for robust matching)
    const categoryNameMap: Record<string, string> = {}
    if (Array.isArray(expenseCategories)) {
      for (const cat of expenseCategories) {
        if (cat.id && cat.category_name) {
          // Store with both original and lowercase keys for case-insensitive lookup
          categoryNameMap[cat.id] = cat.category_name
          categoryNameMap[cat.id.toLowerCase()] = cat.category_name
        }
      }
    }

    if (!analytics) {
      return {
        success: true,
        data: {
          monthly_trends: [],
          category_breakdown: [],
          status_summary: {
            total: 0,
            draft: 0,
            submitted: 0,
            approved: 0,
            rejected: 0,
            reimbursed: 0
          },
          total_amount: 0,
          currency: employeeProfile.home_currency || 'MYR',
          trends: {
            total_amount_change: 0,
            total_claims_change: 0,
            avg_claim_change: 0,
            pending_approval_change: 0
          }
        }
      }
    }

    // Transform Convex analytics to expected format
    const analyticsData = {
      monthly_trends: [],
      category_breakdown: Object.entries(analytics.categoryTotals || {}).map(([category, amount]) => ({
        category,
        // Resolve name with case-insensitive fallback
        category_name: categoryNameMap[category] || categoryNameMap[category.toLowerCase()] || category,
        total_amount: amount,
        claims_count: analytics.categoryCounts?.[category] || 0, // Use actual count from Convex
        approved_amount: 0,
        percentage: analytics.totalAmount ? ((amount as number) / analytics.totalAmount) * 100 : 0
      })),
      status_summary: {
        total: analytics.totalClaims || 0,
        ...analytics.statusCounts
      },
      total_amount: analytics.totalAmount || 0,
      currency: employeeProfile.home_currency || 'MYR',
      scope,
      user_role: {
        employee: true,
        manager: isManager,
        admin: isAdmin
      },
      trends: {
        total_amount_change: 0,
        total_claims_change: 0,
        avg_claim_change: 0,
        pending_approval_change: 0
      }
    }

    return {
      success: true,
      data: analyticsData
    }

  } catch (error) {
    console.error('Failed to get expense analytics:', error)
    return { success: false, error: 'Failed to fetch expense analytics' }
  }
}
