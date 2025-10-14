/**
 * V1 Enabled COGS Categories API
 *
 * GET /api/v1/account-management/cogs-categories/enabled - Get only enabled categories
 *
 * Purpose:
 * - Returns only active COGS categories for dropdowns and auto-categorization
 * - Filtered subset of all categories (excludes is_active: false)
 * - Used by invoice processing and transaction creation UIs
 *
 * North Star Architecture:
 * - Thin wrapper delegating to account-management.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { getEnabledCOGSCategories } from '@/domains/account-management/lib/account-management.service'

// GET - Retrieve only enabled COGS categories for dropdowns
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userData = await getUserData(userId)

    if (!userData.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    console.log(`[Enabled COGS Categories V1 API] Fetching enabled categories for business: ${userData.business_id}`)

    // Call service layer
    const categories = await getEnabledCOGSCategories(userData.business_id)

    console.log(`[Enabled COGS Categories V1 API] Found ${categories.length} enabled categories`)

    return NextResponse.json({
      success: true,
      data: categories
    })

  } catch (error) {
    console.error('[Enabled COGS Categories V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
