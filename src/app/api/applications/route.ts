/**
 * Applications API Endpoints
 * Implements multi-document personal finance applications (loans, etc.)
 * POC: Personal Loan applications with 5 prescriptive document slots
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createBusinessContextSupabaseClient, createServiceSupabaseClient, getUserData } from '@/lib/supabase-server'

interface CreateApplicationRequest {
  title: string
  description?: string
  application_type?: string // Defaults to 'personal_loan'
}

interface ApplicationListParams {
  page?: number
  limit?: number
  status?: 'draft' | 'processing' | 'completed' | 'failed' | 'needs_review'
  application_type?: string
}

// Create new application
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: CreateApplicationRequest = await request.json()
    const { title, description, application_type = 'personal_loan' } = body

    // Validate required fields
    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      )
    }

    console.log(`[Applications API] Creating application for Clerk user: ${userId}`)

    // CRITICAL FIX: Use business context client for proper RLS setup
    const userData = await getUserData(userId)
    console.log(`[Applications API] Resolved to Supabase user: ${userData.id}, business_id: ${userData.business_id}`)

    const supabase = await createBusinessContextSupabaseClient()

    // Verify application type exists
    const { data: appType, error: appTypeError } = await supabase
      .from('application_types')
      .select('*')
      .eq('type_code', application_type)
      .eq('is_active', true)
      .single()

    if (appTypeError || !appType) {
      return NextResponse.json(
        { success: false, error: `Invalid application type: ${application_type}` },
        { status: 400 }
      )
    }

    // Create the application
    const applicationData = {
      user_id: userData.id,
      business_id: userData.business_id,
      application_type,
      title,
      description: description || '',
      status: 'draft',
      slots_filled: 0,
      slots_total: Array.isArray(appType.required_documents) ? appType.required_documents.length : 5,
      progress_percentage: 0
    }

    const { data: application, error: createError } = await supabase
      .from('applications')
      .insert(applicationData)
      .select(`
        *,
        application_types!inner (
          type_code,
          display_name,
          description,
          required_documents
        )
      `)
      .single()

    if (createError) {
      console.error('[Applications API] Failed to create application:', createError)
      return NextResponse.json(
        { success: false, error: 'Failed to create application' },
        { status: 500 }
      )
    }

    console.log(`[Applications API] Created application ${application.id}`)

    return NextResponse.json({
      success: true,
      data: application
    })

  } catch (error) {
    console.error('[Applications API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create application' },
      { status: 500 }
    )
  }
}

// List user's applications
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const params: ApplicationListParams = {
      page: parseInt(searchParams.get('page') || '1'),
      limit: Math.min(parseInt(searchParams.get('limit') || '20'), 100),
      status: searchParams.get('status') as any,
      application_type: searchParams.get('application_type') || undefined
    }

    // Clean up empty string parameters that could cause UUID errors
    if (params.status === '' as any) params.status = undefined
    if (params.application_type === '') params.application_type = undefined

    console.log(`[Applications API] Fetching applications for Clerk user: ${userId}`)
    console.log(`[Applications API] Query params:`, { status: params.status, application_type: params.application_type, page: params.page, limit: params.limit })

    // CRITICAL FIX: Use business context client for proper RLS setup
    const userData = await getUserData(userId)
    console.log(`[Applications API] Resolved to Supabase user: ${userData.id}, business_id: ${userData.business_id}`)

    const supabase = await createBusinessContextSupabaseClient()

    console.log(`[Applications API] Using direct filtering: user_id=${userData.id}, business_id=${userData.business_id}`)

    // DEBUG: First let's test if we can fetch ANY applications at all
    console.log(`[Applications API] DEBUG - About to run debug query with business context client`)
    console.log(`[Applications API] DEBUG - Expected user_id: ${userData.id}`)
    console.log(`[Applications API] DEBUG - Expected business_id: ${userData.business_id}`)

    const { data: allApps, error: allAppsError } = await supabase
      .from('applications')
      .select('id, user_id, business_id, title')
      .limit(5)

    console.log(`[Applications API] DEBUG - Total applications in table (first 5):`, allApps?.length || 0)
    if (allApps && allApps.length > 0) {
      console.log(`[Applications API] DEBUG - Sample applications:`, JSON.stringify(allApps, null, 2))
    }
    if (allAppsError) {
      console.error(`[Applications API] DEBUG - Error fetching all apps:`, allAppsError)
    }

    // SUPER DEBUG: Test with service client (bypasses RLS) to see if data exists at all
    console.log(`[Applications API] SUPER DEBUG - Testing service client (bypasses RLS)`)
    const serviceClient = createServiceSupabaseClient()
    const { data: serviceApps, error: serviceError } = await serviceClient
      .from('applications')
      .select('id, user_id, business_id, title')
      .limit(5)

    console.log(`[Applications API] SUPER DEBUG - Service client found ${serviceApps?.length || 0} applications`)
    if (serviceApps && serviceApps.length > 0) {
      console.log(`[Applications API] SUPER DEBUG - Service client data:`, JSON.stringify(serviceApps, null, 2))
    }
    if (serviceError) {
      console.error(`[Applications API] SUPER DEBUG - Service client error:`, serviceError)
    }

    // Build query with explicit user_id AND business_id filtering (much simpler!)
    let query = supabase
      .from('applications')
      .select(`
        *,
        application_types!inner (
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
      .eq('user_id', userData.id)  // Filter by Supabase user UUID
      .eq('business_id', userData.business_id) // AND filter by business context

    // Apply filters
    if (params.status) {
      query = query.eq('status', params.status)
    }

    if (params.application_type) {
      query = query.eq('application_type', params.application_type)
    }

    // Apply sorting and pagination
    query = query
      .order('created_at', { ascending: false })
      .range((params.page! - 1) * params.limit!, params.page! * params.limit! - 1)

    console.log(`[Applications API] Executing query with user_id AND business_id filtering`)
    console.log(`[Applications API] Query filters: user_id=${userData.id}, business_id=${userData.business_id}`)

    const { data: applications, error, count } = await query

    if (error) {
      console.error('[Applications API] Query error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      })
    } else {
      console.log(`[Applications API] Query successful, found ${applications?.length || 0} applications`)
      console.log(`[Applications API] Raw applications data:`, JSON.stringify(applications, null, 2))
      if (applications && applications.length > 0) {
        console.log(`[Applications API] First application:`, applications[0])
      }
    }

    if (error) {
      console.error('[Applications API] Failed to fetch applications:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch applications' },
        { status: 500 }
      )
    }

    // Get total count for pagination with explicit user_id AND business_id filtering
    const { count: totalCount } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userData.id)
      .eq('business_id', userData.business_id)

    const hasMore = (params.page! - 1) * params.limit! + (applications?.length || 0) < (totalCount || 0)

    // Transform applications to include document slot status and calculate real-time progress
    const transformedApplications = (applications || []).map(app => {
      const requiredDocuments = Array.isArray(app.application_types.required_documents)
        ? app.application_types.required_documents
        : []

      // Handle grouped documents (like payslips) and calculate progress
      let totalSlots = 0
      let completedSlots = 0

      const slotStatus = requiredDocuments.map((reqDoc: any) => {
        // Handle grouped documents (like payslip_group)
        if (reqDoc.group_slots && Array.isArray(reqDoc.group_slots)) {
          totalSlots += 1 // Count group as 1 logical requirement

          // Check if all documents in group are completed
          const groupDocuments = reqDoc.group_slots
            .map((slot: string) => app.application_documents.find((doc: any) => doc.document_slot === slot))
            .filter(Boolean)

          const allCompleted = groupDocuments.length === reqDoc.group_slots.length &&
            groupDocuments.every((doc: any) => doc.processing_status === 'completed')

          if (allCompleted) {
            completedSlots += 1
          }

          return {
            slot: reqDoc.slot,
            display_name: reqDoc.display_name,
            is_critical: reqDoc.is_critical,
            status: allCompleted ? 'completed' : 'empty',
            document_id: null,
            uploaded_at: null
          }
        }

        // Handle individual documents
        totalSlots += 1
        const document = app.application_documents.find((doc: any) => doc.document_slot === reqDoc.slot)
        const isCompleted = document && document.processing_status === 'completed'

        if (isCompleted) {
          completedSlots += 1
        }

        return {
          slot: reqDoc.slot,
          display_name: reqDoc.display_name,
          is_critical: reqDoc.is_critical,
          status: document ? document.processing_status : 'empty',
          document_id: document?.id || null,
          uploaded_at: document?.created_at || null
        }
      })

      // Calculate real-time progress
      const progressPercentage = totalSlots > 0 ? Math.round((completedSlots / totalSlots) * 100) : 0

      return {
        ...app,
        slot_status: slotStatus,
        slots_total: totalSlots,
        slots_filled: completedSlots,
        progress_percentage: progressPercentage
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        applications: transformedApplications,
        pagination: {
          page: params.page!,
          limit: params.limit!,
          total: totalCount || 0,
          has_more: hasMore,
          total_pages: Math.ceil((totalCount || 0) / params.limit!)
        }
      }
    })

  } catch (error) {
    console.error('[Applications API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch applications' },
      { status: 500 }
    )
  }
}