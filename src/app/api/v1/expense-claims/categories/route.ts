/**
 * Expense Categories API v1
 * GET - Get all categories (including inactive for management)
 * POST - Create new category
 * PUT - Update existing category
 * DELETE - Delete category
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  CustomExpenseCategory
} from '@/domains/expense-claims/lib/expense-category.service'

/**
 * GET /api/v1/expense-claims/categories
 * Get all categories for the business (including inactive for management)
 */
export async function GET(request: NextRequest) {
  try {
    const result = await getAllCategories()

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('[API v1 GET /expense-claims/categories] Error:', error)

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

/**
 * POST /api/v1/expense-claims/categories
 * Create a new expense category
 */
export async function POST(request: NextRequest) {
  try {
    const body: CustomExpenseCategory = await request.json()
    const newCategory = await createCategory(body)

    return NextResponse.json({
      success: true,
      data: newCategory
    })
  } catch (error) {
    console.error('[API v1 POST /expense-claims/categories] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Handle permission errors
    if (error instanceof Error && error.message.includes('Insufficient permissions')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      )
    }

    // Handle validation errors
    if (error instanceof Error && (
      error.message.includes('required') ||
      error.message.includes('already exists')
    )) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
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

/**
 * PUT /api/v1/expense-claims/categories
 * Update an existing expense category
 */
export async function PUT(request: NextRequest) {
  try {
    const body: CustomExpenseCategory & { id: string } = await request.json()
    const updatedCategory = await updateCategory(body)

    return NextResponse.json({
      success: true,
      data: updatedCategory
    })
  } catch (error) {
    console.error('[API v1 PUT /expense-claims/categories] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Handle permission errors
    if (error instanceof Error && error.message.includes('Insufficient permissions')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      )
    }

    // Handle not found errors
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      )
    }

    // Handle validation errors
    if (error instanceof Error && error.message.includes('required')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
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

/**
 * DELETE /api/v1/expense-claims/categories
 * Delete an expense category
 */
export async function DELETE(request: NextRequest) {
  try {
    const body: { id: string } = await request.json()
    const result = await deleteCategory(body.id)

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('[API v1 DELETE /expense-claims/categories] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Handle permission errors
    if (error instanceof Error && error.message.includes('Insufficient permissions')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      )
    }

    // Handle not found errors
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      )
    }

    // Handle validation errors
    if (error instanceof Error && error.message.includes('required')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
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
