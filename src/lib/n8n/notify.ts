/**
 * n8n Outbound Webhook Notification
 *
 * Fires webhooks to n8n when expense claim events occur.
 * n8n workflow listens for these events and runs automation logic.
 *
 * Non-blocking: errors are logged but don't fail the parent operation.
 */

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL // e.g. https://your-n8n.app.n8n.cloud/webhook/expense-submitted

interface ExpenseEvent {
  event: 'expense.submitted' | 'expense.approved' | 'expense.rejected'
  claimId: string
  businessId: string
  userId: string
  amount: number
  currency: string
  vendor: string
  category: string
  timestamp: string
}

/**
 * Send expense event to n8n webhook (fire-and-forget).
 * Returns true if sent, false if n8n not configured or failed.
 */
export async function notifyN8n(event: ExpenseEvent): Promise<boolean> {
  if (!N8N_WEBHOOK_URL) {
    console.log('[n8n] No N8N_WEBHOOK_URL configured, skipping notification')
    return false
  }

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000), // 5s timeout
    })

    if (!response.ok) {
      console.error(`[n8n] Webhook failed: ${response.status} ${response.statusText}`)
      return false
    }

    console.log(`[n8n] Notified: ${event.event} for claim ${event.claimId}`)
    return true
  } catch (err) {
    console.error('[n8n] Webhook error:', err instanceof Error ? err.message : err)
    return false
  }
}
