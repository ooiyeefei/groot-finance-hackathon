/**
 * Task Status API Route
 *
 * GET /api/v1/tasks/[id]/status
 *
 * Checks document processing status for Trigger.dev background jobs.
 * Used by frontend to poll for AI extraction progress.
 *
 * Authentication: Clerk user authentication required
 * Use Case: Frontend polling for background job completion
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getTaskStatus } from '@/domains/tasks/lib/task.service'

/**
 * GET - Get Task Status
 *
 * Returns processing status for a background task by task ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get task ID from params
    const { id: taskId } = await params
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'Task ID is required' },
        { status: 400 }
      )
    }

    console.log(`[Task Status API] Checking status for task: ${taskId}`)

    // Call service layer
    const taskStatus = await getTaskStatus(taskId, userId)

    return NextResponse.json({
      success: true,
      data: taskStatus
    })

  } catch (error) {
    console.error('[Task Status API] Error:', error)

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { success: false, error: 'Document not found for this task' },
          { status: 404 }
        )
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get task status'
      },
      { status: 500 }
    )
  }
}
