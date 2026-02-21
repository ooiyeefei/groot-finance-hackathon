import { NextRequest, NextResponse } from 'next/server'
import { emailService } from '@/lib/services/email-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { featureName, userEmail, businessId } = body

    if (!featureName || typeof featureName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'featureName is required' },
        { status: 400 }
      )
    }

    const submitterInfo = userEmail || 'Anonymous user'
    const businessInfo = businessId ? ` (business: ${businessId})` : ''

    const result = await emailService.sendFeedbackNotification({
      recipientEmail: 'dev@hellogroot.com',
      feedbackType: 'feature',
      feedbackMessage: `Feature interest: "${featureName}"\n\nUser: ${submitterInfo}${businessInfo}\n\nThis user clicked "I want this!" to express interest in this upcoming feature.`,
      submitterEmail: userEmail || undefined,
      isAnonymous: !userEmail,
    })

    if (!result.success) {
      console.error('[FeatureInterest] Email failed:', result.error)
      // Return success to client even if email fails — the interest was noted
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[FeatureInterest] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
