/**
 * Leave Management Notifications API
 *
 * Sends email notifications for leave request status changes.
 * Uses AWS SES with Resend fallback.
 * 034-leave-enhance: Also dispatches push notifications via Lambda.
 *
 * POST /api/v1/leave-management/notifications
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { emailService } from '@/lib/services/email-service'

// 034-leave-enhance: Push notification dispatch via Lambda
async function dispatchPushNotification(params: {
  recipientUserId: string
  businessId: string
  notificationType: string
  leaveRequestId: string
  recipientName: string
  leaveType: string
  startDate: string
  endDate: string
  reason?: string
}) {
  // Build push notification title and body
  const titleMap: Record<string, string> = {
    submitted: 'New Leave Request',
    approved: 'Leave Approved',
    rejected: 'Leave Rejected',
    cancelled: 'Leave Cancelled',
  }
  const bodyMap: Record<string, string> = {
    submitted: `${params.recipientName} requested ${params.leaveType} (${params.startDate} - ${params.endDate})`,
    approved: `Your ${params.leaveType} (${params.startDate} - ${params.endDate}) has been approved`,
    rejected: `Your ${params.leaveType} was rejected${params.reason ? `: ${params.reason}` : ''}`,
    cancelled: `${params.leaveType} (${params.startDate} - ${params.endDate}) was cancelled`,
  }

  const deepLinkMap: Record<string, string> = {
    submitted: `/en/manager-approval?tab=leave&id=${params.leaveRequestId}`,
    approved: `/en/leave?id=${params.leaveRequestId}`,
    rejected: `/en/leave?id=${params.leaveRequestId}`,
    cancelled: `/en/leave?id=${params.leaveRequestId}`,
  }

  // First, fetch device tokens from Convex
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    console.warn('[Push] NEXT_PUBLIC_CONVEX_URL not set, skipping push')
    return null
  }

  // Query push_subscriptions via Convex HTTP API
  const tokensResponse = await fetch(`${convexUrl}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'functions/pushSubscriptions:getByUserId',
      args: { userId: params.recipientUserId },
      format: 'json',
    }),
  })

  if (!tokensResponse.ok) {
    console.warn('[Push] Failed to fetch device tokens:', tokensResponse.status)
    return null
  }

  const tokensData = await tokensResponse.json()
  const tokens = tokensData?.value || []
  const activeTokens = tokens.filter((t: any) => t.isActive)

  if (activeTokens.length === 0) {
    console.log('[Push] No active device tokens for user', params.recipientUserId)
    return { sent: 0, failed: 0, skipped: 'no_active_tokens' }
  }

  // Check notification preferences (FR-009): skip push if user disabled approval category
  try {
    const prefsResponse = await fetch(`${convexUrl}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'functions/notifications:getPreferences',
        args: { userId: params.recipientUserId },
        format: 'json',
      }),
    })
    if (prefsResponse.ok) {
      const prefsData = await prefsResponse.json()
      const prefs = prefsData?.value
      // If user has explicitly disabled approval notifications, skip push
      if (prefs?.inApp?.approval === false) {
        console.log('[Push] User disabled approval notifications, skipping push')
        return { sent: 0, failed: 0, skipped: 'preferences_disabled' }
      }
    }
  } catch (prefErr) {
    // Non-blocking — if preference check fails, proceed with push
    console.warn('[Push] Preference check failed, proceeding:', prefErr)
  }

  // Invoke push Lambda via @aws-sdk/client-lambda with IAM auth
  const pushLambdaArn = process.env.PUSH_NOTIFICATION_LAMBDA_ARN
  if (!pushLambdaArn) {
    console.warn('[Push] PUSH_NOTIFICATION_LAMBDA_ARN not set, logging intent only')
    console.log(`[Push] Would send to ${activeTokens.length} devices:`, {
      title: titleMap[params.notificationType],
      body: bodyMap[params.notificationType],
      tokens: activeTokens.length,
    })
    return { sent: 0, pending: activeTokens.length, note: 'PUSH_NOTIFICATION_LAMBDA_ARN not configured' }
  }

  try {
    const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda')
    const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-west-2' })

    const payload = JSON.stringify({
      recipientUserId: params.recipientUserId,
      businessId: params.businessId,
      title: titleMap[params.notificationType] || 'Leave Update',
      body: bodyMap[params.notificationType] || 'Your leave request has been updated',
      data: {
        type: `leave_${params.notificationType}`,
        leaveRequestId: params.leaveRequestId,
        deepLink: deepLinkMap[params.notificationType] || '/en/leave',
      },
      deviceTokens: activeTokens.map((t: any) => ({
        platform: t.platform,
        deviceToken: t.deviceToken,
      })),
    })

    const command = new InvokeCommand({
      FunctionName: pushLambdaArn,
      InvocationType: 'RequestResponse',
      Payload: new TextEncoder().encode(payload),
    })

    const response = await lambda.send(command)
    const resultPayload = response.Payload ? JSON.parse(new TextDecoder().decode(response.Payload)) : null

    console.log('[Push] Lambda invocation result:', resultPayload)

    // FR-011: Track failures per token, deactivate after 3 consecutive failures
    if (resultPayload?.errors?.length > 0) {
      for (const err of resultPayload.errors) {
        try {
          await fetch(`${convexUrl}/api/mutation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'functions/pushSubscriptions:trackFailure',
              args: { deviceToken: err.deviceToken, maxFailures: 3 },
              format: 'json',
            }),
          })
        } catch (trackErr) {
          console.warn('[Push] Failed to track token failure:', trackErr)
        }
      }
    }

    return resultPayload || { sent: 0, failed: 0 }
  } catch (lambdaErr: any) {
    console.error('[Push] Lambda invocation failed:', lambdaErr.message)
    return { sent: 0, failed: activeTokens.length, error: lambdaErr.message }
  }
}

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
  // 034-leave-enhance: Push notification fields
  recipientUserId?: string
  leaveRequestId?: string
  businessId?: string
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

    // 034-leave-enhance: Dispatch push notification if recipientUserId provided
    let pushResult = null
    if (body.recipientUserId && body.leaveRequestId) {
      try {
        pushResult = await dispatchPushNotification({
          recipientUserId: body.recipientUserId,
          businessId: body.businessId || '',
          notificationType: body.notificationType,
          leaveRequestId: body.leaveRequestId,
          recipientName: body.recipientName,
          leaveType: body.leaveType,
          startDate: body.startDate,
          endDate: body.endDate,
          reason: body.reason,
        })
        console.log(`[Leave Notifications] Push notification result:`, pushResult)
      } catch (pushError) {
        // Non-blocking — push failure shouldn't fail the API call
        console.warn('[Leave Notifications] Push notification failed:', pushError)
      }
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      provider: result.provider,
      push: pushResult,
    })
  } catch (error) {
    console.error('[Leave Notifications] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
