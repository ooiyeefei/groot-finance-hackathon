/**
 * Enabled Expense Categories API v1
 * GET - Get only enabled categories for dropdowns and categorization
 */

import { NextRequest, NextResponse } from 'next/server'
import { getEnabledCategories } from '@/domains/expense-claims/lib/expense-category.service'

/**
 * GET /api/v1/expense-claims/categories/enabled
 * Get only enabled categories for dropdowns and auto-categorization
 */
export async function GET(request: NextRequest) {
  try {
    const enabledCategories = await getEnabledCategories()

    return NextResponse.json({
      success: true,
      data: enabledCategories
    })
  } catch (error) {
    console.error('[API v1 GET /expense-claims/categories/enabled] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}
