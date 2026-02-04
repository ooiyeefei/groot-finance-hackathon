/**
 * Leave Management Notifications API
 *
 * Sends email notifications for leave request status changes.
 * Uses AWS SES with Resend fallback.
 *
 * POST /api/v1/leave-management/notifications
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { emailService } from '@/lib/services/email-service'

// Notification types
type NotificationType = 'approved' | 'rejected' | 'submitted' | 'cancelled'

interface NotificationRequest {
  notificationType: NotificationType
  recipientEmail: string
  recipientName: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  approverName?: string
  reason?: string
  businessName: string
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse request body
    const body: NotificationRequest = await request.json()

    // Validate required fields
    const requiredFields = ['notificationType', 'recipientEmail', 'recipientName', 'leaveType', 'startDate', 'endDate', 'totalDays', 'businessName']
    for (const field of requiredFields) {
      if (!body[field as keyof NotificationRequest]) {
        return NextResponse.json(
          { success: false, error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }

    // Validate notification type
    const validTypes: NotificationType[] = ['approved', 'rejected', 'submitted', 'cancelled']
    if (!validTypes.includes(body.notificationType)) {
      return NextResponse.json(
        { success: false, error: `Invalid notification type: ${body.notificationType}` },
        { status: 400 }
      )
    }

    // Send email notification
    const result = await emailService.sendLeaveNotification({
      notificationType: body.notificationType,
      recipientEmail: body.recipientEmail,
      recipientName: body.recipientName,
      leaveType: body.leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      totalDays: body.totalDays,
      approverName: body.approverName,
      reason: body.reason,
      businessName: body.businessName,
    })

    if (!result.success) {
      console.error('[Leave Notifications] Failed to send email:', result.error)
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send notification' },
        { status: 500 }
      )
    }

    console.log(`[Leave Notifications] Email sent successfully via ${result.provider} to ${body.recipientEmail}`)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      provider: result.provider,
    })
  } catch (error) {
    console.error('[Leave Notifications] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
