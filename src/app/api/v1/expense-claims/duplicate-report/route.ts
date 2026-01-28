/**
 * Duplicate Report API Route
 * Feature: 007-duplicate-expense-detection (User Story 3)
 *
 * GET /api/v1/expense-claims/duplicate-report
 *
 * Generates a report of all potential duplicate expense claims for audit.
 * Only accessible by owners, finance_admins, and managers.
 *
 * Query Parameters:
 * - status: 'pending' | 'confirmed_duplicate' | 'dismissed' | 'all' (default: 'all')
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

export async function GET(request: NextRequest) {
  try {
    // 1. Get authenticated Convex client
    const { client, userId } = await getAuthenticatedConvex()
    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Parse query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as 'pending' | 'confirmed_duplicate' | 'dismissed' | 'all' | null
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Validate status parameter
    const validStatuses = ['pending', 'confirmed_duplicate', 'dismissed', 'all']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate date format if provided
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (startDate && !dateRegex.test(startDate)) {
      return NextResponse.json(
        { success: false, error: 'Invalid startDate format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }
    if (endDate && !dateRegex.test(endDate)) {
      return NextResponse.json(
        { success: false, error: 'Invalid endDate format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    console.log(`[Duplicate Report API] Fetching report with status=${status}, startDate=${startDate}, endDate=${endDate}`)

    // 3. Get user's business context from Convex
    const businessContext = await client.query(
      api.functions.businesses.getBusinessContext,
      {}
    )

    if (!businessContext) {
      return NextResponse.json(
        { success: false, error: 'No business context found. Please join or create a business first.' },
        { status: 400 }
      )
    }

    // 4. Fetch duplicate report from Convex
    const reportData = await client.query(
      api.functions.duplicateMatches.getDuplicateReport,
      {
        businessId: businessContext.businessId as Id<'businesses'>,
        status: status || 'all',
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }
    )

    // Check if user has permission (handled in Convex query)
    if (!reportData || !reportData.summary) {
      return NextResponse.json(
        { success: false, error: 'Access denied. Only owners, finance admins, and managers can view duplicate reports.' },
        { status: 403 }
      )
    }

    console.log(`[Duplicate Report API] Found ${reportData.matches.length} matches`)

    // 5. Return formatted response
    return NextResponse.json({
      success: true,
      data: {
        matches: reportData.matches,
        summary: reportData.summary,
        filters: {
          status: status || 'all',
          startDate: startDate || null,
          endDate: endDate || null,
        },
        metadata: {
          generatedAt: new Date().toISOString(),
          businessId: businessContext.businessId,
        },
      },
    })

  } catch (error) {
    console.error('[Duplicate Report API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
