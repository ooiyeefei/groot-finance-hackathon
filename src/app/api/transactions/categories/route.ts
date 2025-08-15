/**
 * Transaction Categories API Endpoint
 * Returns available transaction categories for SEA SMEs
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { TRANSACTION_CATEGORIES, TransactionType } from '@/types/transaction'

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
    const transactionType = searchParams.get('type') as TransactionType

    console.log(`[Categories API] Getting categories for user ${userId}, type: ${transactionType || 'all'}`)

    // If specific type requested, return only those categories
    if (transactionType && ['income', 'expense', 'transfer'].includes(transactionType)) {
      const typeCategories = TRANSACTION_CATEGORIES[transactionType]
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
          transaction_type: transactionType,
          categories: formattedCategories,
          total: formattedCategories.length
        }
      })
    }

    // Return all categories organized by transaction type
    const allCategories = Object.entries(TRANSACTION_CATEGORIES).reduce((acc, [type, categories]) => {
      acc[type as TransactionType] = Object.entries(categories).map(([category, subcategories]) => ({
        key: category,
        name: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        subcategories: (subcategories as string[]).map(sub => ({
          key: sub,
          name: sub.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }))
      }))
      return acc
    }, {} as Record<TransactionType, Array<{
      key: string
      name: string
      subcategories: Array<{key: string, name: string}>
    }>>)

    // Calculate totals
    const totals = Object.entries(allCategories).reduce((acc, [type, categories]) => {
      acc[type as TransactionType] = categories.length
      return acc
    }, {} as Record<TransactionType, number>)

    return NextResponse.json({
      success: true,
      data: {
        categories: allCategories,
        totals,
        transaction_types: ['income', 'expense', 'transfer']
      }
    })

  } catch (error) {
    console.error('[Categories API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}