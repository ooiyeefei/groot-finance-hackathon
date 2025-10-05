/**
 * Accounting Entry Categories API Endpoint
 * Returns P&L categories for Southeast Asian SMEs (Income, Cost of Goods Sold, Expense)
 * REFACTOR: Updated from transaction categories to P&L accounting structure
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { TRANSACTION_CATEGORIES, TransactionType } from '@/types/transaction'

// P&L Types mapping - hardcoded for accounting compliance
const P_AND_L_TYPES = ['Income', 'Cost of Goods Sold', 'Expense'] as const
type PLAccountingType = typeof P_AND_L_TYPES[number]

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
    const accountingType = searchParams.get('type') as PLAccountingType

    console.log(`[Accounting Categories API] Getting P&L categories for user ${userId}, type: ${accountingType || 'all'}`)

    // If specific P&L type requested, return only those categories
    if (accountingType && P_AND_L_TYPES.includes(accountingType)) {
      // Map P&L types to transaction categories for backwards compatibility
      let mappedType: TransactionType
      if (accountingType === 'Income') {
        mappedType = 'Income'
      } else if (accountingType === 'Cost of Goods Sold') {
        mappedType = 'Cost of Goods Sold'
      } else if (accountingType === 'Expense') {
        mappedType = 'Expense'
      } else {
        return NextResponse.json(
          { success: false, error: 'Invalid accounting type' },
          { status: 400 }
        )
      }

      const typeCategories = TRANSACTION_CATEGORIES[mappedType]
      const formattedCategories = Object.entries(typeCategories).map(([category, subcategories]) => ({
        key: category,
        name: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        subcategories: (subcategories as string[]).map(sub => ({
          key: sub,
          name: sub.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }))
      }))

      return NextResponse.json({
        success: true,
        data: {
          accounting_type: accountingType,
          categories: formattedCategories,
          total: formattedCategories.length,
          p_and_l_structure: true
        }
      })
    }

    // Return P&L categories organized by accounting type
    const allPLCategories = {
      'Income': Object.entries(TRANSACTION_CATEGORIES.Income).map(([category, subcategories]) => ({
        key: category,
        name: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        subcategories: (subcategories as string[]).map(sub => ({
          key: sub,
          name: sub.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }))
      })),
      'Cost of Goods Sold': Object.entries(TRANSACTION_CATEGORIES['Cost of Goods Sold']).map(([category, subcategories]) => ({
        key: category,
        name: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        subcategories: (subcategories as string[]).map(sub => ({
          key: sub,
          name: sub.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }))
      })),
      'Expense': Object.entries(TRANSACTION_CATEGORIES.Expense).map(([category, subcategories]) => ({
        key: category,
        name: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        subcategories: (subcategories as string[]).map(sub => ({
          key: sub,
          name: sub.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }))
      }))
    }

    // Calculate totals
    const totals = Object.entries(allPLCategories).reduce((acc, [type, categories]) => {
      acc[type as PLAccountingType] = categories.length
      return acc
    }, {} as Record<PLAccountingType, number>)

    return NextResponse.json({
      success: true,
      data: {
        categories: allPLCategories,
        totals,
        accounting_types: P_AND_L_TYPES,
        p_and_l_structure: true,
        note: 'Cost of Goods Sold and Expense share the same Level 2 categories but serve different P&L line items'
      }
    })

  } catch (error) {
    console.error('[Accounting Categories API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}