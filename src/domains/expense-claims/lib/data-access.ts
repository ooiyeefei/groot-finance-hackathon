/**
 * North Star Expense Claims Domain Actions
 * Consolidated business logic for all expense claim operations
 */

import { createBusinessContextSupabaseClient, createServiceSupabaseClient, getUserData } from '@/lib/db/supabase-server'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { currencyService } from '@/lib/services/currency-service'
import { StoragePathBuilder, generateUniqueFilename, type DocumentType } from '@/lib/storage-paths'
import { tasks } from '@trigger.dev/sdk/v3'
import type { extractReceiptData } from '@/trigger/extract-receipt-data'
import type { convertPdfToImage } from '@/trigger/convert-pdf-to-image'
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

// Status transitions are now handled by RBAC permissions only
// No hardcoded transition validation - removed per user request

/**
 * Find appropriate approver using manager hierarchy with enhanced routing logic
 * - If user has assigned manager_id and manager has approval permissions: route to manager
 * - If manager has no assignment or insufficient permissions: route to submitter's own manager (if they are manager/admin)
 * - Otherwise: fallback to any admin, then any manager
 */
async function findNextApprover(
  submittingUserId: string,
  businessId: string,
  supabase: any
): Promise<string | null> {
  try {
    console.log(`[Approver Routing] Finding approver for user ${submittingUserId} in business ${businessId}`)

    // Step 1: Get submitting user's manager from business_memberships
    const { data: submitterMembership, error: membershipError } = await supabase
      .from('business_memberships')
      .select('manager_id, role')
      .eq('user_id', submittingUserId)
      .eq('business_id', businessId)
      .eq('status', 'active')
      .single()

    if (membershipError) {
      console.log(`[Approver Routing] Error fetching membership: ${membershipError.message}`)
    }

    // Step 2: If user has a manager, check if manager is active and has approval permissions
    if (submitterMembership?.manager_id) {
      console.log(`[Approver Routing] Found manager_id: ${submitterMembership.manager_id}`)

      const { data: managerMembership, error: managerError } = await supabase
        .from('business_memberships')
        .select('user_id, role, status, manager_id')
        .eq('user_id', submitterMembership.manager_id)
        .eq('business_id', businessId)
        .eq('status', 'active')
        .in('role', ['manager', 'admin'])
        .single()

      if (!managerError && managerMembership) {
        console.log(`[Approver Routing] Manager is active with role: ${managerMembership.role}`)
        return managerMembership.user_id
      } else {
        console.log(`[Approver Routing] Manager not found or inactive: ${managerError?.message}`)
      }
    } else {
      console.log(`[Approver Routing] No manager_id found for user`)
    }

    // Step 3: Enhanced routing - if submitter is manager/admin without assignment, route to themselves
    if (submitterMembership?.role && ['manager', 'admin'].includes(submitterMembership.role)) {
      console.log(`[Approver Routing] Submitter is ${submitterMembership.role}, routing to themselves`)
      return submittingUserId
    }

    // Step 4: Fallback to any active admin in the business
    console.log(`[Approver Routing] Falling back to admin`)
    const { data: adminUser, error: adminError } = await supabase
      .from('business_memberships')
      .select('user_id')
      .eq('business_id', businessId)
      .eq('role', 'admin')
      .eq('status', 'active')
      .limit(1)
      .single()

    if (!adminError && adminUser) {
      console.log(`[Approver Routing] Found admin fallback: ${adminUser.user_id}`)
      return adminUser.user_id
    }

    // Step 5: Last resort - any manager in the business
    console.log(`[Approver Routing] No admin found, trying any manager`)
    const { data: managerUser, error: managerFallbackError } = await supabase
      .from('business_memberships')
      .select('user_id')
      .eq('business_id', businessId)
      .eq('role', 'manager')
      .eq('status', 'active')
      .limit(1)
      .single()

    if (!managerFallbackError && managerUser) {
      console.log(`[Approver Routing] Found manager fallback: ${managerUser.user_id}`)
      return managerUser.user_id
    }

    console.log(`[Approver Routing] No approver found - all methods exhausted`)
    return null

  } catch (error) {
    console.error('[Approver Routing] Unexpected error:', error)
    return null
  }
}

// File upload constants
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// Status transition validation removed - RBAC permissions handle all access control


/**
 * Create new expense claim
 */
export async function createExpenseClaim(
  userId: string,
  request: CreateExpenseClaimRequest
): Promise<{ success: boolean; data?: ExpenseClaim; error?: string; task_id?: string }> {
  try {
    // Get user data and ensure profile
    const userData = await getUserData(userId)
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      return { success: false, error: 'Failed to retrieve employee profile' }
    }

    const supabase = await createBusinessContextSupabaseClient()

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
        !original_amount || !original_currency || !transaction_date) {
      return { success: false, error: 'Missing required fields' }
    }

    // Validate currency
    if (!currencyService.isSupportedCurrency(original_currency)) {
      return { success: false, error: `Unsupported currency: ${original_currency}` }
    }

    // Validate expense category only if provided (trigger.dev job will determine if null)
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

    // Convert to home currency
    const userHomeCurrency = userData.home_currency
    let homeAmount = original_amount
    let exchangeRate = 1
    let exchangeRateDate = new Date().toISOString().split('T')[0]

    if (original_currency !== userHomeCurrency) {
      try {
        const conversion = await currencyService.convertAmount(
          original_amount,
          original_currency,
          userHomeCurrency as any
        )
        homeAmount = conversion.converted_amount
        exchangeRate = conversion.exchange_rate
        exchangeRateDate = conversion.rate_date
      } catch (error) {
        console.error('Currency conversion failed:', error)
      }
    }

    // Server-side duplicate detection
    if (reference_number) {
      const { data: existingClaims } = await supabase
        .from('expense_claims')
        .select('id, status, vendor_name, total_amount, currency, transaction_date, reference_number, created_at')
        .eq('user_id', employeeProfile.user_id)
        .eq('reference_number', reference_number)
        .eq('transaction_date', transaction_date)
        .eq('total_amount', original_amount)

      if (existingClaims && existingClaims.length > 0) {
        const existing = existingClaims[0]
        return {
          success: false,
          error: 'duplicate_detected',
          data: {
            claimId: existing.id,
            reference_number: existing.reference_number,
            transaction_date: existing.transaction_date,
            amount: existing.total_amount,
            vendor_name: existing.vendor_name,
            status: existing.status,
            created_at: existing.created_at
          } as any
        }
      }
    }

    // Create expense claim data
    const expenseClaimData = {
      user_id: employeeProfile.user_id,
      business_id: employeeProfile.business_id,
      status: request.file ? 'uploading' : 'draft',
      business_purpose,
      expense_category,
      storage_path: storage_path || null,

      // File metadata (if file upload)
      file_name: request.file?.name || null,
      file_type: request.file?.type || null,
      file_size: request.file?.size || null,

      // Financial data
      description: description,
      vendor_name: vendor_name,
      total_amount: original_amount,
      currency: original_currency,
      transaction_date: transaction_date,
      reference_number: reference_number || null,
      home_currency: userHomeCurrency,
      home_currency_amount: homeAmount,
      exchange_rate: exchangeRate,

      // Store processing metadata
      processing_metadata: {
        processing_method: request.file ? request.processing_mode : 'manual_entry',
        status: request.file ? 'uploading' : 'completed',
        processing_timestamp: new Date().toISOString(),
        document_id: documentId,
        original_filename: request.file?.name,
        file_size: request.file?.size,
        file_type: request.file?.type,

        // Store financial data for later accounting entry creation
        financial_data: {
          description,
          vendor_name,
          vendor_id: vendor_id || null,
          total_amount: original_amount,
          original_currency,
          home_currency: userHomeCurrency,
          home_currency_amount: homeAmount,
          exchange_rate: exchangeRate,
          exchange_rate_date: exchangeRateDate,
          transaction_date,
          reference_number: reference_number || null,
          notes: notes || null,
          business_purpose_details: notes || null, // Store notes here since no column exists
          subtotal_amount: null,
          tax_amount: null
        },

        // Store line items
        line_items: line_items.map((item, index) => ({
          item_description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_amount: item.quantity * item.unit_price,
          currency: original_currency,
          tax_amount: item.tax_rate ? (item.quantity * item.unit_price * item.tax_rate) : 0,
          tax_rate: item.tax_rate || 0,
          item_category: item.item_category || null,
          line_order: index + 1
        })),

        // Store category mapping
        category_mapping: {
          business_category: expense_category,
          accounting_category: accountingCategory,
          category_name: categoryInfo?.business_category_name
        },

        employee_profile_id: employeeProfile.id,
        created_via: 'expense_claims_api_v1'
      }
    }

    // Log expense claim creation without sensitive data
    console.log('[DEBUG] Creating expense claim:', {
      user_id: expenseClaimData.user_id,
      business_id: expenseClaimData.business_id,
      status: expenseClaimData.status,
      currency: expenseClaimData.currency,
      amount_present: !!expenseClaimData.total_amount,
      has_file: !!request.file
    })

    // Create expense claim
    const { data: expenseClaim, error: claimError } = await supabase
      .from('expense_claims')
      .insert(expenseClaimData)
      .select()
      .single()

    if (claimError) {
      console.error('Supabase insert error:', claimError)
      return { success: false, error: `Failed to create expense claim record: ${claimError.message}` }
    }

    // Handle file upload if present
    if (request.file && documentId) {
      // Generate storage path
      const storageBuilder = new StoragePathBuilder(
        employeeProfile.business_id,
        employeeProfile.user_id,
        undefined,
        expenseClaim.id
      )
      const uniqueFilename = generateUniqueFilename(request.file.name)
      standardizedFilePath = storageBuilder.forDocument('expense_receipts' as DocumentType).raw(uniqueFilename)

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('expense_claims')
        .upload(standardizedFilePath, request.file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        // Update record with failure status
        await supabase
          .from('expense_claims')
          .update({
            status: 'failed',
            processing_metadata: {
              ...expenseClaim.processing_metadata,
              status: 'upload_failed',
              error_message: uploadError.message,
              error_timestamp: new Date().toISOString()
            }
          })
          .eq('id', expenseClaim.id)

        return { success: false, error: 'Failed to upload file to storage' }
      }

      // Update claim with successful upload
      await supabase
        .from('expense_claims')
        .update({
          status: request.processing_mode === 'ai' ? 'analyzing' : 'draft',
          storage_path: standardizedFilePath,
          processing_metadata: {
            ...expenseClaim.processing_metadata,
            storage_path: standardizedFilePath,
            upload_timestamp: new Date().toISOString(),
            status: request.processing_mode === 'ai' ? 'analyzing' : 'draft'
          }
        })
        .eq('id', expenseClaim.id)

      // Trigger processing based on file type - PDF conversion first, then AI extraction
      if (request.processing_mode === 'ai') {
        try {
          if (request.file.type === 'application/pdf') {
            // PDF files: Trigger conversion first, AI extraction will be triggered automatically after conversion
            console.log(`[PDF Processing] Triggering PDF-to-image conversion for expense claim: ${expenseClaim.id}`)

            triggerResult = await tasks.trigger<typeof convertPdfToImage>(
              "convert-pdf-to-image",
              {
                documentId: expenseClaim.id,
                pdfStoragePath: standardizedFilePath,
                documentDomain: 'expense_claims'
              }
            )

            await supabase
              .from('expense_claims')
              .update({
                status: 'converting', // Indicate PDF conversion in progress
                processing_metadata: {
                  ...expenseClaim.processing_metadata,
                  pdf_conversion_job_id: triggerResult.id,
                  pdf_conversion_timestamp: new Date().toISOString(),
                  processing_stage: 'pdf_conversion'
                }
              })
              .eq('id', expenseClaim.id)

            console.log(`[PDF Processing] PDF conversion job triggered: ${triggerResult.id}`)

          } else {
            // Image files: Direct AI processing
            console.log(`[Image Processing] Triggering direct AI processing for expense claim: ${expenseClaim.id}`)

            const { data: urlData } = await supabase.storage
              .from('expense_claims')
              .createSignedUrl(standardizedFilePath, 600)

            if (urlData) {
              triggerResult = await tasks.trigger<typeof extractReceiptData>(
                "extract-receipt-data",
                {
                  expenseClaimId: expenseClaim.id,
                  documentId: documentId,
                  userId: userData.id,
                  documentDomain: 'expense_claims',
                  receiptImageUrl: urlData.signedUrl
                }
              )

              await supabase
                .from('expense_claims')
                .update({
                  processing_metadata: {
                    ...expenseClaim.processing_metadata,
                    ai_extraction_job_id: triggerResult.id,
                    ai_extraction_timestamp: new Date().toISOString(),
                    processing_stage: 'ai_extraction'
                  }
                })
                .eq('id', expenseClaim.id)

              console.log(`[Image Processing] AI extraction job triggered: ${triggerResult.id}`)
            }
          }
        } catch (triggerError) {
          console.error('Failed to trigger processing:', triggerError)
          await supabase
            .from('expense_claims')
            .update({
              status: 'failed',
              processing_metadata: {
                ...expenseClaim.processing_metadata,
                status: 'failed',
                error_message: 'Failed to trigger background processing',
                error_timestamp: new Date().toISOString()
              }
            })
            .eq('id', expenseClaim.id)
        }
      }
    }

    // Log audit event
    await supabase
      .from('audit_events')
      .insert({
        business_id: employeeProfile.business_id,
        actor_user_id: userData.id,
        event_type: `expense_claim.${request.file ? 'upload' : 'create'}_${request.processing_mode || 'manual'}`,
        target_entity_type: 'expense_claim',
        target_entity_id: expenseClaim.id,
        details: {
          processing_mode: request.processing_mode || 'manual',
          filename: request.file?.name,
          file_size: request.file?.size,
          expense_amount: original_amount,
          currency: original_currency,
          storage_path: standardizedFilePath,
          document_id: documentId,
          flow_type: 'north_star_api_v1'
        }
      })

    return {
      success: true,
      data: expenseClaim,
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

    // ✅ SECURITY FIX: Use business context client universally to enforce RLS
    // Role-based access is handled through query logic, not client selection
    const isAdmin = employeeProfile.role_permissions.admin
    const isManager = employeeProfile.role_permissions.manager

    const supabase = await createBusinessContextSupabaseClient()

    // Build query with user information
    let query = supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:accounting_entries(*),
        employee:users!expense_claims_user_id_fkey(id, full_name, email)
      `)

    // Apply role-based filtering
    if (isAdmin) {
      // Admin can see all claims in their business
      query = query.eq('business_id', employeeProfile.business_id)
    } else if (isManager) {
      // Managers see their team's claims + own claims within their business
      query = query.eq('business_id', employeeProfile.business_id)
      if (params.approver === 'me') {
        // Show claims assigned to me (reviewed_by=me + status=submitted)
        query = query.eq('reviewed_by', employeeProfile.user_id).eq('status', 'submitted')
      } else {
        // Show my own claims OR claims assigned to me for approval
        query = query.or(`user_id.eq.${employeeProfile.user_id},reviewed_by.eq.${employeeProfile.user_id}`)
      }
    } else {
      // Employees see only their own claims (business_id filtering handled by RLS)
      query = query.eq('user_id', employeeProfile.user_id)
    }

    // Apply filters
    if (params.status) {
      query = query.eq('status', params.status)
    }

    if (params.expense_category) {
      query = query.eq('expense_category', params.expense_category)
    }

    if (params.user_id && await canFilterByUserId()) {
      query = query.eq('user_id', params.user_id)
    }

    if (params.date_from) {
      query = query.gte('submitted_at', params.date_from)
    }

    if (params.date_to) {
      query = query.lte('submitted_at', params.date_to)
    }


    if (params.search) {
      const sanitizedSearch = params.search.replace(/[%_]/g, '\\$&').replace(/[^\w\s-]/g, '')
      if (sanitizedSearch.trim()) {
        query = query.or(`business_purpose.ilike.%${sanitizedSearch}%,vendor_name.ilike.%${sanitizedSearch}%`)
      }
    }

    // Duplicate check mode
    if (params.check_duplicate && params.date_from && params.user_id) {
      query = query
        .eq('user_id', params.user_id)
        .eq('transaction_date', params.date_from)

      // Additional filters would be applied in the original request
    }

    // Apply sorting
    const validSortColumns = ['submitted_at', 'created_at', 'status', 'amount']
    let sortColumn = 'created_at'

    if (params.sort_by === 'submission_date' || params.sort_by === 'submitted_at') {
      sortColumn = 'submitted_at'
    } else if (params.sort_by === 'status') {
      sortColumn = 'status'
    } else if (params.sort_by === 'amount') {
      sortColumn = 'total_amount'
    }

    const sortOrder = params.sort_order === 'asc' ? 'asc' : 'desc'
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' })

    // Apply pagination
    const page = params.page || 1
    const limit = Math.min(params.limit || 20, 100)
    const offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    const { data: claims, error } = await query

    if (error) {
      console.error('Supabase query error in listExpenseClaims:', error)
      return { success: false, error: `Failed to fetch expense claims: ${error.message}` }
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('expense_claims')
      .select('*', { count: 'exact', head: true })

    // Apply same role-based filtering for count
    if (isAdmin) {
      countQuery = countQuery.eq('business_id', employeeProfile.business_id)
    } else if (isManager) {
      countQuery = countQuery.eq('business_id', employeeProfile.business_id)
      if (params.approver === 'me') {
        // Count claims assigned to me (reviewed_by=me + status=submitted)
        countQuery = countQuery.eq('reviewed_by', employeeProfile.user_id).eq('status', 'submitted')
      } else {
        // Count my own claims OR claims assigned to me for approval
        countQuery = countQuery.or(`user_id.eq.${employeeProfile.user_id},reviewed_by.eq.${employeeProfile.user_id}`)
      }
    } else {
      countQuery = countQuery.eq('user_id', employeeProfile.user_id)
    }

    const { count: totalCount } = await countQuery
    const hasMore = offset + limit < (totalCount || 0)

    // Calculate summary statistics if this is a management dashboard request
    let summary = null
    if (params.approver === 'me' && (isAdmin || isManager)) {
      // Get summary statistics for the dashboard
      let summaryQuery = supabase
        .from('expense_claims')
        .select('status, home_currency_amount')
        .eq('business_id', employeeProfile.business_id)

      if (isManager && !isAdmin) {
        summaryQuery = summaryQuery.or(`user_id.eq.${employeeProfile.user_id},reviewed_by.eq.${employeeProfile.user_id}`)
      }

      const { data: summaryData } = await summaryQuery

      if (summaryData) {
        const totalClaims = summaryData.length
        const pendingApproval = summaryData.filter(claim => claim.status === 'submitted').length
        const approvedAmount = summaryData
          .filter(claim => claim.status === 'approved' || claim.status === 'reimbursed')
          .reduce((sum, claim) => sum + (claim.home_currency_amount || 0), 0)
        const rejectedCount = summaryData.filter(claim => claim.status === 'rejected').length

        summary = {
          total_claims: totalClaims,
          pending_approval: pendingApproval,
          approved_amount: approvedAmount,
          rejected_count: rejectedCount
        }
      }
    }

    const responseData: any = {
      claims: claims || [],
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        has_more: hasMore,
        total_pages: Math.ceil((totalCount || 0) / limit)
      }
    }

    // Add summary data for management dashboard requests
    if (summary) {
      responseData.summary = summary
      responseData.role = {
        employee: true,
        manager: isManager,
        admin: isAdmin
      }
      // Add recent_claims field that the dashboard expects (same as claims for dashboard view)
      responseData.recent_claims = claims || []
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

    // ✅ SECURITY FIX: Use business context client universally to enforce RLS
    const isAdmin = userProfile.role_permissions.admin
    const isManager = userProfile.role_permissions.manager

    const supabase = await createBusinessContextSupabaseClient()

    // Fetch the expense claim
    let claimQuery = supabase
      .from('expense_claims')
      .select('*')
      .eq('id', claimId)

    // Apply access control
    if (isAdmin || isManager) {
      claimQuery = claimQuery.eq('business_id', userProfile.business_id)
    } else {
      claimQuery = claimQuery.eq('user_id', userProfile.user_id)
    }

    const { data: claim, error } = await claimQuery.single()

    if (error) {
      return { success: false, error: 'Expense claim not found or access denied' }
    }

    // Transform data to include transaction interface
    const transformedClaim = {
      ...claim,
      extracted_data: claim.processing_metadata || null,
      transaction: {
        id: claim.accounting_entry_id,
        description: claim.description,
        original_amount: claim.total_amount,
        original_currency: claim.currency,
        home_currency_amount: claim.home_currency_amount || claim.total_amount,
        home_currency: claim.home_currency || claim.currency,
        transaction_date: claim.transaction_date,
        vendor_name: claim.vendor_name,
        vendor_id: null,
        reference_number: claim.processing_metadata?.financial_data?.reference_number || null,
        notes: null,
        processing_metadata: claim.processing_metadata,
        business_purpose: claim.business_purpose,
        expense_category: claim.expense_category,
        line_items: claim.processing_metadata?.line_items?.map((item: any, index: number) => ({
          id: `temp-${index}`,
          item_description: item.description || item.item_description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_amount: item.total_amount
        })) || []
      }
    }

    return { success: true, data: transformedClaim }

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

    const isAdmin = userProfile.role_permissions.admin
    const isManager = userProfile.role_permissions.manager

    // ✅ SECURITY FIX: Use business context client universally to enforce RLS
    const supabase = await createBusinessContextSupabaseClient()

    // Fetch existing claim
    let existingClaimQuery = supabase
      .from('expense_claims')
      .select('*')
      .eq('id', claimId)

    if (isAdmin || isManager) {
      existingClaimQuery = existingClaimQuery.eq('business_id', userProfile.business_id)
    } else {
      existingClaimQuery = existingClaimQuery.eq('user_id', userProfile.user_id)
    }

    const { data: existingClaim, error: fetchError } = await existingClaimQuery.single()

    if (fetchError || !existingClaim) {
      return { success: false, error: 'Expense claim not found or access denied' }
    }

    // Handle status changes
    if (request.status && request.status !== existingClaim.status) {
      // REMOVED: Hardcoded status transition validation - let RBAC handle permissions only
      // const validation = validateStatusTransition(existingClaim.status, request.status)
      // if (!validation.isValid) {
      //   return { success: false, error: validation.errors.join(', ') }
      // }

      // Then check RBAC permissions for specific transitions
      let hasPermission = false
      let permissionError = ''

      switch (request.status) {
        case 'submitted':
          // Check if user can submit their own claims (requires ownership check)
          if (existingClaim.user_id === userProfile.user_id) {
            hasPermission = await canSubmitOwnClaim()
            permissionError = 'You do not have permission to submit expense claims'
          } else {
            hasPermission = false
            permissionError = 'You can only submit your own expense claims'
          }
          break

        case 'approved':
        case 'rejected':
          // Only managers and admins can approve/reject claims
          hasPermission = await canApproveExpenseClaims()
          permissionError = 'You do not have permission to approve or reject expense claims'
          break

        case 'reimbursed':
          // Only admins can mark claims as reimbursed
          hasPermission = await canProcessReimbursements()
          permissionError = 'You do not have permission to process reimbursements'
          break

        case 'draft':
          // Check if user can recall/revise their own claims (requires ownership check)
          if (existingClaim.user_id === userProfile.user_id) {
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
      const statusUpdateData: any = {
        status: request.status,
        updated_at: now
      }

      switch (request.status) {
        case 'submitted':
          statusUpdateData.submitted_at = now
          // Use manager hierarchy routing for approval assignment
          // Use reviewed_by + status='submitted' to indicate WHO should approve
          const nextApproverId = await findNextApprover(
            existingClaim.user_id,
            userProfile.business_id,
            supabase
          )
          statusUpdateData.reviewed_by = nextApproverId

          // Log routing decision for debugging
          console.log(`[Expense Submission] Expense claim ${claimId} submitted by user ${existingClaim.user_id}, routed to approver: ${nextApproverId}`)

          if (!nextApproverId) {
            console.warn(`[Expense Submission] No approver found for expense claim ${claimId}`)
          }
          break

        case 'approved':
          statusUpdateData.approved_at = now
          statusUpdateData.reviewed_by = userProfile.user_id

          // ✅ CRITICAL FIX: Use RPC function instead of direct INSERT to ensure proper category mapping
          console.log(`[RPC Approval] Creating accounting entry via RPC for expense claim: ${claimId}`)

          const { data: transactionId, error: rpcError } = await supabase
            .rpc('create_accounting_entry_from_approved_claim', {
              p_claim_id: claimId,
              p_approver_id: userProfile.user_id
            })

          if (rpcError) {
            console.error('[RPC Approval] Failed to create accounting entry via RPC:', rpcError)
            return { success: false, error: `Failed to create accounting entry: ${rpcError.message}` }
          }

          if (!transactionId) {
            console.error('[RPC Approval] RPC function returned null transaction ID')
            return { success: false, error: 'RPC function failed to return accounting entry ID' }
          }

          // Link the accounting entry to the expense claim
          statusUpdateData.accounting_entry_id = transactionId

          console.log(`✅ Accounting entry created via RPC: ${transactionId}`)
          break

        case 'rejected':
          statusUpdateData.rejected_at = now
          statusUpdateData.reviewed_by = userProfile.user_id
          statusUpdateData.rejection_reason = request.comment || request.rejection_reason || 'No reason provided'
          // No need to clear current_approver_id since we use reviewed_by + status pattern
          break

        case 'reimbursed':
          statusUpdateData.paid_at = now
          statusUpdateData.reviewed_by = userProfile.user_id

          // Update accounting entry status
          if (existingClaim.accounting_entry_id) {
            await supabase
              .from('accounting_entries')
              .update({ status: 'paid', payment_date: now })
              .eq('id', existingClaim.accounting_entry_id)
          }
          break

        case 'draft':
          // Reset workflow timestamps when recalling
          statusUpdateData.submitted_at = null
          statusUpdateData.approved_at = null
          statusUpdateData.rejected_at = null
          statusUpdateData.paid_at = null
          statusUpdateData.reviewed_by = null
          statusUpdateData.rejection_reason = null
          // No need to clear current_approver_id since we use reviewed_by + status pattern
          break
      }

      // Apply status update
      const { error: statusUpdateError } = await supabase
        .from('expense_claims')
        .update(statusUpdateData)
        .eq('id', claimId)

      if (statusUpdateError) {
        return { success: false, error: 'Failed to update expense claim status' }
      }

      // Log audit event
      await supabase
        .from('audit_events')
        .insert({
          business_id: existingClaim.business_id,
          actor_user_id: userProfile.user_id,
          event_type: `expense_claim.${request.status}`,
          target_entity_type: 'expense_claim',
          target_entity_id: claimId,
          details: {
            previous_status: existingClaim.status,
            new_status: request.status,
            action_comment: request.comment,
            expense_amount: existingClaim.total_amount,
            currency: existingClaim.currency,
            approver_role: userProfile.role,
            risk_score: existingClaim.risk_score
          }
        })

      return await getExpenseClaim(userId, claimId)
    }

    // Handle field updates (only for draft claims)
    if (existingClaim.status !== 'draft') {
      return { success: false, error: 'Cannot edit expense claims that have been submitted' }
    }

    // Get user's home currency for conversion
    const userData = await getUserData(userId)
    const userHomeCurrency = userData.home_currency

    // Convert to home currency if different
    let homeAmount = request.original_amount || existingClaim.total_amount
    let exchangeRate = 1
    let exchangeRateDate = new Date().toISOString().split('T')[0]

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
        exchangeRateDate = conversion.rate_date
      } catch (error) {
        console.error('Currency conversion failed:', error)
      }
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (request.description !== undefined) updateData.description = request.description
    if (request.vendor_name !== undefined) updateData.vendor_name = request.vendor_name
    if (request.original_amount !== undefined) updateData.total_amount = request.original_amount
    if (request.original_currency !== undefined) updateData.currency = request.original_currency
    if (request.transaction_date !== undefined) updateData.transaction_date = request.transaction_date
    if (request.business_purpose !== undefined) updateData.business_purpose = request.business_purpose
    if (request.expense_category !== undefined) updateData.expense_category = request.expense_category
    if (request.business_purpose_details !== undefined) updateData.business_purpose_details = request.business_purpose_details
    if (request.reference_number !== undefined) updateData.reference_number = request.reference_number

    // Update currency fields
    if (request.original_currency || request.original_amount) {
      updateData.home_currency = userHomeCurrency
      updateData.home_currency_amount = homeAmount
      updateData.exchange_rate = exchangeRate
    }

    // Handle line items updates in processing_metadata
    if (request.line_items && Array.isArray(request.line_items)) {
      const existingMetadata = existingClaim.processing_metadata || {}

      const updatedLineItems = request.line_items.map((item: any, index: number) => ({
        item_description: item.description || item.item_description || 'Item',
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total_amount: item.total_amount || 0,
        currency: request.original_currency || existingClaim.currency,
        tax_amount: item.tax_amount || 0,
        tax_rate: item.tax_rate || 0,
        item_category: item.item_category || null,
        line_order: index + 1
      }))

      updateData.processing_metadata = {
        ...existingMetadata,
        line_items: updatedLineItems,
        last_updated: new Date().toISOString(),
        update_source: 'manual_edit_v1'
      }
    }

    // Apply field update
    const { error: updateError } = await supabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', claimId)

    if (updateError) {
      return { success: false, error: 'Failed to update expense claim' }
    }

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

    const isAdmin = userProfile.role_permissions.admin
    const isManager = userProfile.role_permissions.manager

    // ✅ SECURITY FIX: Use business context client universally to enforce RLS
    // Role-based access is handled through query logic, not client selection
    const supabase = await createBusinessContextSupabaseClient()

    // Check if claim exists and is accessible
    let existingClaimQuery = supabase
      .from('expense_claims')
      .select('id, status, accounting_entry_id, user_id, business_id')
      .eq('id', claimId)

    if (isAdmin || isManager) {
      existingClaimQuery = existingClaimQuery.eq('business_id', userProfile.business_id)
    } else {
      existingClaimQuery = existingClaimQuery.eq('user_id', userProfile.user_id)
    }

    const { data: existingClaim, error: fetchError } = await existingClaimQuery.single()

    if (fetchError || !existingClaim) {
      return { success: false, error: 'Expense claim not found or access denied' }
    }

    // Only allow deleting draft claims
    if (existingClaim.status !== 'draft') {
      return { success: false, error: 'Only draft expense claims can be deleted' }
    }

    // Delete associated accounting entry first (if exists)
    if (existingClaim.accounting_entry_id) {
      await supabase
        .from('accounting_entries')
        .delete()
        .eq('id', existingClaim.accounting_entry_id)
    }

    // Delete the expense claim
    const { error: deleteError } = await supabase
      .from('expense_claims')
      .delete()
      .eq('id', claimId)

    if (deleteError) {
      return { success: false, error: 'Failed to delete expense claim' }
    }

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

    const isAdmin = employeeProfile.role_permissions.admin
    const isManager = employeeProfile.role_permissions.manager

    // ✅ SECURITY FIX: Use business context client universally to enforce RLS
    // Role-based access is handled through query logic, not client selection
    const supabase = await createBusinessContextSupabaseClient()

    // Calculate date ranges for current and previous periods
    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

    console.log('[Analytics] Calculating trends for current month:', currentMonthStart.toISOString().split('T')[0])
    console.log('[Analytics] Previous month range:', previousMonthStart.toISOString().split('T')[0], 'to', previousMonthEnd.toISOString().split('T')[0])

    // Build base query for ALL claims (for monthly trends calculation)
    let analyticsQuery = supabase
      .from('expense_claims')
      .select('status, total_amount, home_currency_amount, expense_category, created_at, submitted_at')
      .eq('business_id', employeeProfile.business_id)

    // Apply scope filtering
    if (scope === 'personal') {
      analyticsQuery = analyticsQuery.eq('user_id', employeeProfile.user_id)
    } else if (scope === 'department' && isManager && !isAdmin) {
      // Managers see their team's claims + own claims
      analyticsQuery = analyticsQuery.or(`user_id.eq.${employeeProfile.user_id},reviewed_by.eq.${employeeProfile.user_id}`)
    }
    // Company scope - admin can see all claims (no additional filtering needed)

    const { data: claims, error } = await analyticsQuery

    if (error) {
      console.error('Analytics query error:', error)
      return { success: false, error: 'Failed to fetch expense analytics data' }
    }

    if (!claims || claims.length === 0) {
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
          currency: employeeProfile.home_currency || 'SGD',
          trends: {
            total_amount_change: 0,
            total_claims_change: 0,
            avg_claim_change: 0,
            pending_approval_change: 0
          }
        }
      }
    }

    // Separate current and previous month data for trend calculation
    const currentMonthClaims = claims.filter(claim => {
      const dateToUse = claim.submitted_at || claim.created_at
      const claimDate = new Date(dateToUse)
      return claimDate >= currentMonthStart
    })

    const previousMonthClaims = claims.filter(claim => {
      const dateToUse = claim.submitted_at || claim.created_at
      const claimDate = new Date(dateToUse)
      return claimDate >= previousMonthStart && claimDate <= previousMonthEnd
    })

    console.log('[Analytics] Current month claims:', currentMonthClaims.length)
    console.log('[Analytics] Previous month claims:', previousMonthClaims.length)

    // Calculate current period metrics
    const currentMetrics = {
      totalAmount: currentMonthClaims.reduce((sum, claim) =>
        sum + (claim.home_currency_amount || claim.total_amount || 0), 0),
      totalClaims: currentMonthClaims.length,
      avgClaim: currentMonthClaims.length > 0 ?
        currentMonthClaims.reduce((sum, claim) =>
          sum + (claim.home_currency_amount || claim.total_amount || 0), 0) / currentMonthClaims.length : 0,
      pendingApproval: currentMonthClaims.filter(claim => claim.status === 'submitted').length
    }

    // Calculate previous period metrics
    const previousMetrics = {
      totalAmount: previousMonthClaims.reduce((sum, claim) =>
        sum + (claim.home_currency_amount || claim.total_amount || 0), 0),
      totalClaims: previousMonthClaims.length,
      avgClaim: previousMonthClaims.length > 0 ?
        previousMonthClaims.reduce((sum, claim) =>
          sum + (claim.home_currency_amount || claim.total_amount || 0), 0) / previousMonthClaims.length : 0,
      pendingApproval: previousMonthClaims.filter(claim => claim.status === 'submitted').length
    }

    // ✅ FIXED: Calculate percentage changes with proper handling of new data scenarios
    const calculateTrendChange = (current: number, previous: number): number => {
      if (previous === 0 && current === 0) return 0 // Both zero = no change
      if (previous === 0 && current > 0) return 100 // New data = 100% growth
      if (previous > 0 && current === 0) return -100 // Lost all data = 100% decline
      return ((current - previous) / previous) * 100 // Standard percentage change
    }

    const trends = {
      total_amount_change: calculateTrendChange(currentMetrics.totalAmount, previousMetrics.totalAmount),
      total_claims_change: calculateTrendChange(currentMetrics.totalClaims, previousMetrics.totalClaims),
      avg_claim_change: calculateTrendChange(currentMetrics.avgClaim, previousMetrics.avgClaim),
      pending_approval_change: calculateTrendChange(currentMetrics.pendingApproval, previousMetrics.pendingApproval)
    }

    console.log('[Analytics] Current metrics:', currentMetrics)
    console.log('[Analytics] Previous metrics:', previousMetrics)
    console.log('[Analytics] Calculated trends:', trends)

    // Calculate monthly trends based on submitted_at (or created_at as fallback)
    const monthlyTrends = claims.reduce((acc: any, claim: any) => {
      // Use submitted_at if available, otherwise fall back to created_at
      const dateToUse = claim.submitted_at || claim.created_at
      const claimDate = new Date(dateToUse)
      const month = `${claimDate.getFullYear()}-${(claimDate.getMonth() + 1).toString().padStart(2, '0')}-01`

      if (!acc[month]) {
        acc[month] = {
          month,
          total_amount: 0,
          claims_count: 0,
          approved_amount: 0,
          approved_count: 0
        }
      }

      acc[month].total_amount += claim.home_currency_amount || claim.total_amount || 0
      acc[month].claims_count += 1

      if (claim.status === 'approved' || claim.status === 'reimbursed') {
        acc[month].approved_amount += claim.home_currency_amount || claim.total_amount || 0
        acc[month].approved_count += 1
      }

      return acc
    }, {})

    // Convert to array and sort by month
    const monthlyTrendsArray = Object.values(monthlyTrends).sort((a: any, b: any) =>
      a.month.localeCompare(b.month)
    )

    // Calculate category breakdown
    const categoryBreakdown = claims.reduce((acc: any, claim: any) => {
      const category = claim.expense_category || 'Uncategorized'
      if (!acc[category]) {
        acc[category] = {
          category,
          total_amount: 0,
          claims_count: 0,
          approved_amount: 0,
          percentage: 0
        }
      }

      acc[category].total_amount += claim.home_currency_amount || claim.total_amount || 0
      acc[category].claims_count += 1

      if (claim.status === 'approved' || claim.status === 'reimbursed') {
        acc[category].approved_amount += claim.home_currency_amount || claim.total_amount || 0
      }

      return acc
    }, {})

    // Calculate percentages and convert to array
    const totalAmount = claims.reduce((sum, claim) =>
      sum + (claim.home_currency_amount || claim.total_amount || 0), 0
    )

    const categoryBreakdownArray = Object.values(categoryBreakdown).map((cat: any) => ({
      ...cat,
      percentage: totalAmount > 0 ? (cat.total_amount / totalAmount) * 100 : 0
    })).sort((a: any, b: any) => b.total_amount - a.total_amount)

    // Calculate status summary
    const statusSummary = claims.reduce((acc, claim) => {
      acc.total += 1
      acc[claim.status as keyof typeof acc] = (acc[claim.status as keyof typeof acc] || 0) + 1
      return acc
    }, {
      total: 0,
      draft: 0,
      uploading: 0,
      analyzing: 0,
      failed: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      reimbursed: 0
    })

    const analyticsData = {
      monthly_trends: monthlyTrendsArray,
      category_breakdown: categoryBreakdownArray,
      status_summary: statusSummary,
      total_amount: totalAmount,
      currency: employeeProfile.home_currency || 'SGD',
      scope,
      user_role: {
        employee: true,
        manager: isManager,
        admin: isAdmin
      },
      trends: trends
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