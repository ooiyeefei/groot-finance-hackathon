/**
 * Application Service Layer
 * Core business logic for application operations
 */

import { auth } from '@clerk/nextjs/server'
import {
  createBusinessContextSupabaseClient,
  getUserData
} from '@/lib/db/supabase-server'
import { calculateSlotStatus } from '../utils/slot-calculator'
import { calculateProgressStats } from '../utils/progress-calculator'

import type {
  Application,
  ApplicationWithSlotStatus,
  ApplicationListResponse,
  RequiredDocument,
  ApplicationDocument
} from '../types/application.types'

import type {
  CreateApplicationInput,
  UpdateApplicationInput,
  ListApplicationsParams
} from '../validation/application.schema'

// ============================================================================
// List Applications
// ============================================================================

/**
 * Retrieves paginated list of applications for the current user
 * Logic extracted from /src/app/api/applications/route.ts:121-343
 *
 * @param params - Query parameters (page, limit, status, application_type)
 * @returns Promise with applications list and pagination metadata
 */
export async function listApplications(
  params: ListApplicationsParams,
  retryCount: number = 0
): Promise<ApplicationListResponse> {
  // Get authenticated user from Clerk
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  console.log(`[ApplicationService.listApplications] Fetching applications for Clerk user: ${userId} (attempt ${retryCount + 1})`)
  console.log(`[ApplicationService.listApplications] Query params:`, params)

  // CRITICAL FIX: Get fresh user data every time to avoid cache races
  let userData
  let supabase

  try {
    // Always get fresh user data and business context together
    console.log(`[ApplicationService.listApplications] 🔄 Getting fresh user data and business context...`)

    userData = await getUserData(userId)
    console.log(`[ApplicationService.listApplications] ✅ Resolved to Supabase user: ${userData.id}, business_id: ${userData.business_id}`)

    if (!userData.business_id) {
      console.error(`[ApplicationService.listApplications] ❌ No business_id found for user ${userData.id}`)
      throw new Error('No active business context - user must create or join a business first')
    }

    // Create business context client with the same userId to ensure consistency
    supabase = await createBusinessContextSupabaseClient(userId)
    console.log(`[ApplicationService.listApplications] ✅ Business context client created with consistent user context`)

    // CRITICAL: Verify business context by testing a simple query
    console.log(`[ApplicationService.listApplications] 🔍 Verifying business context establishment...`)
    const { error: contextTestError } = await supabase
      .from('business_memberships')
      .select('business_id')
      .eq('user_id', userData.id)
      .eq('business_id', userData.business_id)
      .limit(1)

    if (contextTestError) {
      console.error(`[ApplicationService.listApplications] ❌ Business context verification failed:`, contextTestError)
      // Clear cache and throw error to trigger retry
      const { invalidateUserCache } = await import('@/lib/db/business-context-cache')
      invalidateUserCache(userId)
      throw new Error('Business context not properly established')
    }

    console.log(`[ApplicationService.listApplications] ✅ Business context verified successfully`)

  } catch (error) {
    console.error(`[ApplicationService.listApplications] ❌ Failed to establish business context:`, error)

    // If this is the first attempt and we have a context error, retry once
    if (retryCount === 0 && (error instanceof Error && error.message.includes('Business context'))) {
      console.log(`[ApplicationService.listApplications] 🔄 Business context error on first attempt, retrying with fresh context...`)
      await new Promise(resolve => setTimeout(resolve, 200)) // Short delay
      return await listApplications(params, 1)
    }

    throw error
  }

  // Build query with explicit user_id AND business_id filtering
  let query = supabase
    .from('applications')
    .select(`
      *,
      application_types (
        type_code,
        display_name,
        description,
        required_documents
      ),
      application_documents (
        id,
        document_slot,
        processing_status,
        created_at
      )
    `)
    .eq('user_id', userData.id)
    .eq('business_id', userData.business_id)

  // Apply status filter if provided
  if (params.status) {
    query = query.eq('status', params.status)
  }

  // Apply application_type filter if provided
  if (params.application_type) {
    query = query.eq('application_type', params.application_type)
  }

  // Apply sorting and pagination
  query = query
    .order('created_at', { ascending: false })
    .range((params.page - 1) * params.limit, params.page * params.limit - 1)

  console.log(`[ApplicationService.listApplications] 📋 Executing query with filters:`)
  console.log(`[ApplicationService.listApplications] - user_id: ${userData.id}`)
  console.log(`[ApplicationService.listApplications] - business_id: ${userData.business_id}`)
  console.log(`[ApplicationService.listApplications] - status: ${params.status || 'ALL'}`)
  console.log(`[ApplicationService.listApplications] - application_type: ${params.application_type || 'ALL'}`)
  console.log(`[ApplicationService.listApplications] - page: ${params.page}, limit: ${params.limit}`)

  const { data: applications, error } = await query

  if (error) {
    console.error('[ApplicationService.listApplications] ❌ Query error:', error)
    throw new Error('Failed to fetch applications')
  }

  console.log(`[ApplicationService.listApplications] 📊 Query result: found ${applications?.length || 0} applications`)

  // Check for race condition - empty results when user has applications
  if (!applications || applications.length === 0) {
    console.log(`[ApplicationService.listApplications] ⚠️ Empty results detected - checking for race condition`)

    try {
      // Quick check: Are there actually applications for this user?
      const { count: totalApplicationsForUser } = await supabase
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userData.id)
        .eq('business_id', userData.business_id)

      console.log(`[ApplicationService.listApplications] 🔍 Total applications for user/business: ${totalApplicationsForUser}`)

      // If user has applications but query returned empty, this is likely a race condition
      if (totalApplicationsForUser && totalApplicationsForUser > 0 && retryCount === 0) {
        console.log(`[ApplicationService.listApplications] 🔄 Race condition detected - retrying with fresh business context...`)
        console.log(`[ApplicationService.listApplications] Expected: ${totalApplicationsForUser} applications, Got: 0`)

        // Clear cache and retry once with completely fresh context
        const { invalidateUserCache } = await import('@/lib/db/business-context-cache')
        invalidateUserCache(userId)

        // Wait briefly and retry once
        await new Promise(resolve => setTimeout(resolve, 300))
        return await listApplications(params, 1)
      } else if (retryCount > 0) {
        console.log(`[ApplicationService.listApplications] 🔄 Retry completed - using results as-is`)
      }
    } catch (countError) {
      console.error(`[ApplicationService.listApplications] ❌ Failed to check application count:`, countError)
      // Continue with empty results if count check fails
    }
  }

  // Get total count for pagination
  const { count: totalCount } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userData.id)
    .eq('business_id', userData.business_id)

  const hasMore = (params.page - 1) * params.limit + (applications?.length || 0) < (totalCount || 0)

  // Transform applications using centralized utility functions
  const transformedApplications = (applications || []).map((app: any) => {
    const requiredDocuments: RequiredDocument[] = Array.isArray(app.application_types.required_documents)
      ? app.application_types.required_documents
      : []

    // Use centralized slot calculator
    const slotStatus = calculateSlotStatus(
      requiredDocuments,
      app.application_documents as ApplicationDocument[]
    )

    // Use centralized progress calculator
    const progressStats = calculateProgressStats(slotStatus)

    return {
      ...app,
      slot_status: slotStatus,
      slots_total: progressStats.total_slots,
      slots_filled: progressStats.completed_slots,
      progress_percentage: progressStats.progress_percentage
    }
  })

  return {
    applications: transformedApplications,
    pagination: {
      page: params.page,
      limit: params.limit,
      total: totalCount || 0,
      has_more: hasMore,
      total_pages: Math.ceil((totalCount || 0) / params.limit)
    }
  }
}

// ============================================================================
// Create Application
// ============================================================================

/**
 * Creates a new application for the current user
 * Logic extracted from /src/app/api/applications/route.ts:25-118
 *
 * @param data - Application creation data (title, description, application_type)
 * @returns Promise with newly created application
 */
export async function createApplication(
  data: CreateApplicationInput
): Promise<Application> {
  // Get authenticated user from Clerk
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  console.log(`[ApplicationService.createApplication] Creating application for Clerk user: ${userId}`)

  // Get Supabase user data and business context
  const userData = await getUserData(userId)
  console.log(`[ApplicationService.createApplication] Resolved to Supabase user: ${userData.id}, business_id: ${userData.business_id}`)

  const supabase = await createBusinessContextSupabaseClient()

  // Verify application type exists and is active
  const { data: appType, error: appTypeError } = await supabase
    .from('application_types')
    .select('*')
    .eq('type_code', data.application_type)
    .eq('is_active', true)
    .single()

  if (appTypeError || !appType) {
    throw new Error(`Invalid application type: ${data.application_type}`)
  }

  // Prepare application data
  const applicationData = {
    user_id: userData.id,
    business_id: userData.business_id,
    application_type: data.application_type,
    title: data.title,
    description: data.description || '',
    status: 'draft' as const,
    slots_filled: 0,
    slots_total: Array.isArray(appType.required_documents) ? appType.required_documents.length : 5,
    progress_percentage: 0
  }

  // Create the application with joined application_types data
  const { data: application, error: createError } = await supabase
    .from('applications')
    .insert(applicationData)
    .select(`
      *,
      application_types (
        type_code,
        display_name,
        description,
        required_documents
      )
    `)
    .single()

  if (createError) {
    console.error('[ApplicationService.createApplication] Failed to create application:', createError)
    throw new Error('Failed to create application')
  }

  console.log(`[ApplicationService.createApplication] Created application ${application.id}`)

  return application as Application
}

// ============================================================================
// Get Single Application
// ============================================================================

/**
 * Retrieves a single application by ID with detailed slot information
 * Logic extracted from /src/app/api/applications/[id]/route.ts:17-213
 *
 * @param applicationId - UUID of the application
 * @returns Promise with application details including slot status
 */
export async function getApplication(
  applicationId: string
): Promise<ApplicationWithSlotStatus> {
  // Get authenticated user from Clerk
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  console.log(`[ApplicationService.getApplication] User ${userId} accessing application ${applicationId}`)

  // Get Supabase user data and business context
  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  // Fetch application first
  const { data: application, error } = await supabase
    .from('applications')
    .select(`
      *,
      application_types (
        type_code,
        display_name,
        description,
        required_documents
      )
    `)
    .eq('id', applicationId)
    .single()

  if (error) {
    console.error('[ApplicationService.getApplication] Error fetching application:', error)
    throw new Error('Application not found or access denied')
  }

  // Fetch application documents separately to avoid .single() conflicts with multiple rows
  const { data: applicationDocuments, error: docsError } = await supabase
    .from('application_documents')
    .select(`
      id,
      document_slot,
      slot_position,
      file_name,
      storage_path,
      converted_image_path,
      processing_status,
      document_type,
      document_classification_confidence,
      error_message,
      extracted_data,
      created_at,
      updated_at
    `)
    .eq('application_id', applicationId)
    .is('deleted_at', null)
    .order('slot_position', { ascending: true })

  // Attach the documents to the application object for consistent interface
  const enrichedApplication = {
    ...application,
    application_documents: applicationDocuments || []
  }

  if (docsError) {
    console.error('[ApplicationService.getApplication] Error fetching application documents:', docsError)
    // Continue with empty documents array if docs fetch fails
  }

  // Transform data to include detailed slot status
  const requiredDocuments = Array.isArray(enrichedApplication.application_types.required_documents)
    ? enrichedApplication.application_types.required_documents
    : []

  // Create detailed slot information
  const slotDetails = requiredDocuments.map((reqDoc: any) => {
    // Handle grouped documents (like payslips)
    if (reqDoc.group_slots && Array.isArray(reqDoc.group_slots)) {
      // Find all documents in this group
      const groupDocuments = reqDoc.group_slots
        .map((slot: string) => enrichedApplication.application_documents.find((doc: any) => doc.document_slot === slot))
        .filter(Boolean)

      // Determine group status based on all documents
      let groupStatus = 'empty'
      if (groupDocuments.length > 0) {
        const allCompleted = groupDocuments.every((doc: any) => doc.processing_status === 'completed')
        const anyProcessing = groupDocuments.some((doc: any) =>
          ['pending', 'classifying', 'pending_extraction', 'extracting'].includes(doc.processing_status)
        )
        const anyFailed = groupDocuments.some((doc: any) =>
          ['failed', 'classification_failed'].includes(doc.processing_status)
        )

        if (allCompleted && groupDocuments.length === reqDoc.group_slots.length) {
          groupStatus = 'completed'
        } else if (anyProcessing) {
          groupStatus = 'processing'
        } else if (anyFailed) {
          groupStatus = 'error'
        } else {
          groupStatus = 'partial'
        }
      }

      return {
        slot: reqDoc.slot,
        display_name: reqDoc.display_name,
        description: reqDoc.description,
        is_critical: reqDoc.is_critical,
        document_type: reqDoc.document_type,
        status: groupStatus,
        group_slots: reqDoc.group_slots,
        group_documents: groupDocuments.map((doc: any) => ({
          id: doc.id,
          file_name: doc.file_name,
          storage_path: doc.storage_path,
          converted_image_path: doc.converted_image_path,
          processing_status: doc.processing_status,
          document_type: doc.document_type,
          classification_confidence: doc.document_classification_confidence,
          error_message: doc.error_message,
          extracted_data: doc.extracted_data,
          uploaded_at: doc.created_at,
          updated_at: doc.updated_at
        })),
        document: null // For group documents, we don't have a single document
      }
    }

    // Handle individual documents
    const document = enrichedApplication.application_documents.find((doc: any) => doc.document_slot === reqDoc.slot)

    let slotStatus = 'empty'
    if (document) {
      switch (document.processing_status) {
        case 'pending':
        case 'classifying':
        case 'pending_extraction':
        case 'extracting':
          slotStatus = 'processing'
          break
        case 'completed':
          slotStatus = 'completed'
          break
        case 'failed':
        case 'classification_failed':
          slotStatus = 'error'
          break
        default:
          slotStatus = document.processing_status || 'empty'
      }
    }

    return {
      slot: reqDoc.slot,
      display_name: reqDoc.display_name,
      description: reqDoc.description,
      is_critical: reqDoc.is_critical,
      document_type: reqDoc.document_type,
      status: slotStatus,
      document: document ? {
        id: document.id,
        file_name: document.file_name,
        storage_path: document.storage_path,
        converted_image_path: document.converted_image_path,
        processing_status: document.processing_status,
        document_type: document.document_type,
        classification_confidence: document.document_classification_confidence,
        error_message: document.error_message,
        extracted_data: document.extracted_data,
        uploaded_at: document.created_at,
        updated_at: document.updated_at
      } : null
    }
  })

  // Calculate progress statistics
  const completedSlots = slotDetails.filter((slot: any) => slot.status === 'completed').length
  const criticalSlots = slotDetails.filter((slot: any) => slot.is_critical)
  const completedCriticalSlots = criticalSlots.filter((slot: any) => slot.status === 'completed').length
  const canSubmit = completedCriticalSlots === criticalSlots.length

  const finalApplication = {
    ...enrichedApplication,
    slot_details: slotDetails,
    progress_stats: {
      total_slots: slotDetails.length,
      completed_slots: completedSlots,
      critical_slots: criticalSlots.length,
      completed_critical_slots: completedCriticalSlots,
      can_submit: canSubmit,
      progress_percentage: Math.round((completedSlots / slotDetails.length) * 100)
    }
  }

  return finalApplication as ApplicationWithSlotStatus
}

// ============================================================================
// Update Application
// ============================================================================

/**
 * Updates an existing application (draft only)
 * Logic extracted from /src/app/api/applications/[id]/route.ts:216-302
 *
 * @param applicationId - UUID of the application
 * @param data - Fields to update (title, description)
 * @returns Promise with updated application
 */
export async function updateApplication(
  applicationId: string,
  data: UpdateApplicationInput
): Promise<Application> {
  // Get authenticated user from Clerk
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  console.log(`[ApplicationService.updateApplication] User ${userId} updating application ${applicationId}`)

  // Get Supabase user data and business context
  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  // Check if application exists and is accessible with RLS enforcement
  const { data: existingApp, error: fetchError } = await supabase
    .from('applications')
    .select('id, status, user_id')
    .eq('id', applicationId)
    .single()

  if (fetchError || !existingApp) {
    throw new Error('Application not found or access denied')
  }

  // Only allow editing draft applications
  if (existingApp.status !== 'draft') {
    throw new Error('Cannot edit submitted applications')
  }

  // Prepare update data
  const updateData: any = {
    updated_at: new Date().toISOString()
  }

  if (data.title) updateData.title = data.title
  if (data.description !== undefined) updateData.description = data.description

  // Update the application
  const { data: updatedApp, error: updateError } = await supabase
    .from('applications')
    .update(updateData)
    .eq('id', applicationId)
    .select(`
      *,
      application_types (
        type_code,
        display_name,
        description,
        required_documents
      )
    `)
    .single()

  if (updateError) {
    console.error('[ApplicationService.updateApplication] Error updating application:', updateError)
    throw new Error('Failed to update application')
  }

  console.log(`[ApplicationService.updateApplication] Updated application ${applicationId}`)

  return updatedApp as Application
}

// ============================================================================
// Delete Application
// ============================================================================

/**
 * Deletes a draft application (documents preserved and disassociated)
 * Logic extracted from /src/app/api/applications/[id]/route.ts:305-390
 *
 * @param applicationId - UUID of the application to delete
 * @returns Promise<void>
 */
export async function deleteApplication(
  applicationId: string
): Promise<void> {
  // Get authenticated user from Clerk
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  console.log(`[ApplicationService.deleteApplication] User ${userId} deleting application ${applicationId}`)

  // Get Supabase user data and business context
  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  // Check if application exists and is accessible with RLS enforcement
  const { data: existingApp, error: fetchError } = await supabase
    .from('applications')
    .select('id, status, user_id')
    .eq('id', applicationId)
    .single()

  if (fetchError || !existingApp) {
    throw new Error('Application not found or access denied')
  }

  // Only allow deleting draft applications
  if (existingApp.status !== 'draft') {
    throw new Error('Only draft applications can be deleted')
  }

  // Disassociate documents from application (preserve documents, clear application_id)
  const { error: documentsError } = await supabase
    .from('application_documents')
    .update({
      application_id: null,
      document_slot: null,
      updated_at: new Date().toISOString()
    })
    .eq('application_id', applicationId)

  if (documentsError) {
    console.error('[ApplicationService.deleteApplication] Error disassociating documents:', documentsError)
    // Continue with application deletion even if document disassociation fails
  } else {
    console.log(`[ApplicationService.deleteApplication] Successfully disassociated documents from application ${applicationId}`)
  }

  // Delete the application
  const { error: deleteError } = await supabase
    .from('applications')
    .delete()
    .eq('id', applicationId)

  if (deleteError) {
    console.error('[ApplicationService.deleteApplication] Error deleting application:', deleteError)
    throw new Error('Failed to delete application')
  }

  console.log(`[ApplicationService.deleteApplication] Successfully deleted application ${applicationId} and disassociated documents`)
}
