/**
 * Enhanced Expense Approval API - Enterprise Edition
 * Implements Otto's compliance controls and Gemini Pro's performance optimizations
 * Backward compatible with existing approvals API
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createBusinessContextSupabaseClient } from '@/lib/supabase-server'
import { workflowEngine } from '@/lib/services/enhanced-workflow-engine'
import { z } from 'zod'

// Enhanced approval request validation (Otto's requirement)
const ApprovalRequestSchema = z.object({
  claim_id: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'request_changes', 'override_approve']),
  comment: z.string().optional(),
  override_justification: z.string().optional(),
  risk_acknowledgment: z.boolean().optional()
})

const BulkApprovalSchema = z.object({
  claim_ids: z.array(z.string().uuid()).max(50),
  action: z.enum(['approve', 'reject']),
  comment: z.string().optional()
})

// GET - Enhanced pending claims with risk scoring and Otto's metadata
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = await createBusinessContextSupabaseClient()
    const { searchParams } = new URL(request.url)
    const includeRiskAnalysis = searchParams.get('include_risk') === 'true'
    const riskThreshold = parseInt(searchParams.get('risk_threshold') || '0')

    // Get user profile with enhanced role checking
    const { data: userProfile, error: profileError } = await supabase
      .from('business_memberships')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (profileError || !userProfile) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    // Enhanced claims query with risk scoring and vendor information
    const { data: claims, error: claimsError } = await supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:accounting_entries(*),
        employee:users!inner(id,full_name,email),
        vendor:vendors(*),
        policy_overrides(*)
      `)
      .eq('employee.business_id', userProfile.business_id)
      .in('status', ['submitted', 'under_review'])
      .is('deleted_at', null)
      .order('created_at', { ascending: true })   // Oldest first

    if (claimsError) {
      console.error('[Enhanced Approvals API] Error fetching claims:', claimsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch pending claims' },
        { status: 500 }
      )
    }

    // Get business categories and compliance rules
    const { data: businessData } = await supabase
      .from('businesses')
      .select('custom_expense_categories')
      .eq('id', userProfile.business_id)
      .single()

    const { data: complianceRules } = await supabase
      .from('compliance_rules')
      .select('*')
      .eq('business_id', userProfile.business_id)
      .eq('is_active', true)

    // Enrich claims with Otto's enhanced metadata
    const enrichedClaims = claims?.map(claim => {
      const category = businessData?.custom_expense_categories?.find((cat: any) => 
        cat.category_code === claim.expense_category
      )
      
      const amount = claim.transaction?.home_currency_amount || 0
      
      // Risk indicators based on available data
      const riskIndicators = []
      if (amount > 10000) riskIndicators.push('HIGH_VALUE')
      if (claim.vendor?.verification_status === 'unverified') riskIndicators.push('UNVERIFIED_VENDOR')
      if (claim.policy_overrides?.length > 0) riskIndicators.push('POLICY_OVERRIDE')
      
      // Compliance status
      const complianceStatus = {
        requires_receipt: amount > 300, // ASEAN threshold
        receipt_provided: !!claim.business_purpose_details?.file_upload?.file_path,
        vendor_verified: claim.vendor?.verification_status === 'verified',
        business_purpose_complete: !!claim.business_purpose_details?.project_code
      }

      return {
        id: claim.id,
        employee_name: claim.employee?.full_name || 'Unknown',
        user_id: claim.user_id,
        employee_department: null, // Department info no longer available from employee_profiles
        description: claim.transaction?.description || 'Expense Claim',
        business_purpose: claim.business_purpose,
        business_purpose_details: claim.business_purpose_details,
        
        // Financial information
        original_amount: claim.transaction?.original_amount || 0,
        original_currency: claim.transaction?.original_currency || 'SGD',
        converted_amount: amount,
        home_currency: claim.transaction?.home_currency || 'SGD',
        
        // Transaction details
        transaction_date: claim.transaction?.transaction_date,
        vendor_name: claim.transaction?.vendor_name || claim.vendor?.name,
        vendor_info: claim.vendor,
        
        // Category and policy
        expense_category: claim.expense_category,
        category_name: category?.category_name || claim.expense_category,
        policy_limit: category?.policy_limit,
        is_over_limit: category?.policy_limit && amount > category.policy_limit,
        
        // Status and workflow
        status: claim.status,
        submission_date: claim.submitted_at || claim.created_at,
        current_approver_id: claim.current_approver_id,
        approval_chain: claim.approval_chain || [],
        
        // Enhanced fields
        risk_indicators: riskIndicators,
        compliance_status: complianceStatus,
        policy_overrides: claim.policy_overrides || [],
        
        // Document information
        document_url: null, // Will be populated separately if needed
        receipt_confidence: claim.transaction?.metadata?.confidence_score
      }
    }) || []

    // Calculate enhanced statistics
    const stats = {
      pending: enrichedClaims.length,
      high_value: enrichedClaims.filter(c => c.converted_amount > 10000).length,
      policy_violations: enrichedClaims.filter(c => c.policy_overrides.length > 0).length,
      unverified_vendors: enrichedClaims.filter(c =>
        c.vendor_info && c.vendor_info.verification_status === 'unverified'
      ).length,
      total_pending_amount: enrichedClaims.reduce((sum, c) => sum + c.converted_amount, 0),
      avg_amount: enrichedClaims.length > 0
        ? Math.round(enrichedClaims.reduce((sum, c) => sum + c.converted_amount, 0) / enrichedClaims.length)
        : 0,
      approved_today: 0 // Initialize for dashboard stats
    }

    // Get today's approved count from materialized view (Gemini Pro's optimization)
    const { data: dashboardStats } = await supabase
      .from('manager_dashboard_stats')
      .select('*')
      .eq('manager_id', userProfile.id)
      .single()

    if (dashboardStats) {
      stats.approved_today = dashboardStats.approved_today || 0
    }

    return NextResponse.json({
      success: true,
      data: {
        claims: enrichedClaims,
        stats,
        compliance_rules: complianceRules || [],
        risk_threshold: riskThreshold
      }
    })

  } catch (error) {
    console.error('[Enhanced Approvals API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Enhanced approval with Otto's compliance and Gemini Pro's workflow engine
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    
    // Handle both single and bulk approvals
    if (body.claim_ids && Array.isArray(body.claim_ids)) {
      return handleBulkApproval(userId, body, request)
    } else {
      return handleSingleApproval(userId, body, request)
    }

  } catch (error) {
    console.error('[Enhanced Approvals API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Single approval using enhanced workflow engine
async function handleSingleApproval(
  userId: string, 
  body: any, 
  request: NextRequest
) {
  // Validate input (Otto's requirement)
  const validatedBody = ApprovalRequestSchema.safeParse(body)
  if (!validatedBody.success) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Invalid request format',
        details: validatedBody.error.errors
      },
      { status: 400 }
    )
  }

  const { claim_id, action, comment, override_justification, risk_acknowledgment } = validatedBody.data
  const supabase = await createBusinessContextSupabaseClient()

  // Get user profile
  const { data: userProfile, error: profileError } = await supabase
    .from('business_memberships')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (profileError || !userProfile) {
    return NextResponse.json(
      { success: false, error: 'Employee profile not found' },
      { status: 404 }
    )
  }

  // Execute workflow transition using enhanced engine
  const result = await workflowEngine.executeTransition(claim_id, action, {
    userId,
    userProfile,
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    comment: comment || override_justification
  })

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    )
  }

  // Otto's audit logging
  console.log(`[Enhanced Approvals] ${action} executed by ${userProfile.full_name} for claim ${claim_id}`, {
    previousStatus: result.previousStatus,
    newStatus: result.newStatus,
    policyOverrides: result.policyOverrides?.length || 0
  })

  return NextResponse.json({
    success: true,
    data: {
      claim_id,
      action,
      previous_status: result.previousStatus,
      new_status: result.newStatus,
      policy_overrides: result.policyOverrides,
      audit_event_id: result.auditEventId
    }
  })
}

// Bulk approval using Gemini Pro's optimized function
async function handleBulkApproval(userId: string, body: any, request: NextRequest) {
  const validatedBody = BulkApprovalSchema.safeParse(body)
  if (!validatedBody.success) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Invalid bulk request format',
        details: validatedBody.error.errors
      },
      { status: 400 }
    )
  }

  const { claim_ids, action, comment } = validatedBody.data
  const supabase = await createBusinessContextSupabaseClient()

  // Get user profile
  const { data: userProfile } = await supabase
    .from('business_memberships')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!userProfile) {
    return NextResponse.json(
      { success: false, error: 'Employee profile not found' },
      { status: 404 }
    )
  }

  // Use optimized bulk function (Gemini Pro's recommendation)
  const { data: result, error } = await supabase.rpc('bulk_approve_claims', {
    claim_ids,
    approver_id: userProfile.id,
    action_type: action,
    notes: comment
  })

  if (error) {
    console.error('[Enhanced Approvals] Bulk operation failed:', error)
    return NextResponse.json(
      { success: false, error: 'Bulk approval failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      processed_count: result.processed_count,
      failed_count: result.failed_count,
      action
    }
  })
}