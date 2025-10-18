/**
 * Task Status API Route
 * GET /api/v1/tasks/[id]/status - Check Trigger.dev background job status
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getTaskStatus } from '@/domains/tasks/lib/task.service'

/**
 * GET - Returns processing status for background task by ID
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

    // Get task ID
    const { id: taskId } = await params
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'Task ID is required' },
        { status: 400 }
      )
    }

    console.log(`[Task Status API] Checking status for task: ${taskId}`)

    // Get task status from service
    const taskStatus = await getTaskStatus(taskId, userId)

    return NextResponse.json({
      success: true,
      data: taskStatus
    })

  } catch (error) {
    console.error('[Task Status API] Error:', error)

    // Handle specific errors
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
