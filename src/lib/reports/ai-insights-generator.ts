/**
 * AI Insights Generator for Aging Reports
 *
 * Generates 2-3 bullet point insights on top of consolidated aging reports:
 * - Trend analysis (collection rate changes)
 * - Concentration risk (single debtor dominance)
 * - Behavioral patterns (consistently late debtors)
 *
 * Uses Gemini 3.1 Flash-Lite via OpenAI-compatible endpoint.
 * Optional — fails gracefully if Gemini is unavailable.
 *
 * Part of 035-aging-payable-receivable-report feature (FR-018-019).
 */

interface AgingDebtorData {
  customerName: string
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  days90plus: number
  total: number
}

interface AgingInsightInput {
  reportType: 'ar_aging' | 'ap_aging'
  businessName: string
  currency: string
  asOfDate: string
  debtors: AgingDebtorData[]
  totals: {
    current: number
    days1to30: number
    days31to60: number
    days61to90: number
    days90plus: number
    total: number
  }
}

/**
 * Generate AI insights for an aging report.
 * Returns null if Gemini is unavailable or data is insufficient.
 */
export async function generateAgingInsights(
  input: AgingInsightInput
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.log('[AI Insights] GEMINI_API_KEY not set, skipping insights')
    return null
  }

  // Skip if insufficient data (fewer than 3 debtors)
  if (input.debtors.length < 3) {
    console.log('[AI Insights] Fewer than 3 debtors, skipping insights')
    return null
  }

  const entityLabel = input.reportType === 'ar_aging' ? 'customer' : 'vendor'
  const entityLabelPlural = input.reportType === 'ar_aging' ? 'customers' : 'vendors'
  const reportLabel = input.reportType === 'ar_aging' ? 'Accounts Receivable' : 'Accounts Payable'

  // Build structured data summary for the prompt
  const topDebtors = input.debtors
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map(
      (d) =>
        `  - ${d.customerName}: ${input.currency} ${d.total.toFixed(2)} total (Current: ${d.current.toFixed(2)}, 1-30: ${d.days1to30.toFixed(2)}, 31-60: ${d.days31to60.toFixed(2)}, 61-90: ${d.days61to90.toFixed(2)}, 90+: ${d.days90plus.toFixed(2)})`
    )
    .join('\n')

  const totalOverdue = input.totals.days1to30 + input.totals.days31to60 +
    input.totals.days61to90 + input.totals.days90plus
  const overduePercentage = input.totals.total > 0
    ? ((totalOverdue / input.totals.total) * 100).toFixed(1)
    : '0'

  // Concentration: check if top debtor dominates
  const topDebtor = input.debtors[0]
  const topDebtorPercentage = input.totals.total > 0
    ? ((topDebtor.total / input.totals.total) * 100).toFixed(1)
    : '0'

  const prompt = `You are a financial analyst for ${input.businessName}. Analyze this ${reportLabel} aging report as of ${asOfDateFormatted(input.asOfDate)} and provide exactly 2-3 concise bullet point insights.

Data Summary:
- Total outstanding: ${input.currency} ${input.totals.total.toFixed(2)}
- Total overdue (30+ days): ${input.currency} ${totalOverdue.toFixed(2)} (${overduePercentage}%)
- Number of ${entityLabelPlural}: ${input.debtors.length}
- Top ${entityLabel}: ${topDebtor.customerName} (${topDebtorPercentage}% of total)

Aging Buckets:
- Current: ${input.currency} ${input.totals.current.toFixed(2)}
- 1-30 days: ${input.currency} ${input.totals.days1to30.toFixed(2)}
- 31-60 days: ${input.currency} ${input.totals.days31to60.toFixed(2)}
- 61-90 days: ${input.currency} ${input.totals.days61to90.toFixed(2)}
- 90+ days: ${input.currency} ${input.totals.days90plus.toFixed(2)}

Top ${entityLabelPlural}:
${topDebtors}

Rules:
- Write exactly 2-3 bullet points (use • character)
- Each bullet should be 1 sentence, actionable and specific
- Focus on: concentration risk, overdue severity, and one actionable recommendation
- Use actual names and numbers from the data
- Do NOT include generic advice — be specific to this data
- Write for a business owner, not an accountant`

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gemini-3.1-flash-lite-preview',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(10000), // 10s timeout
      }
    )

    if (!response.ok) {
      console.error('[AI Insights] Gemini API error:', response.status, await response.text())
      return null
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim()

    if (!content) {
      console.log('[AI Insights] Empty response from Gemini')
      return null
    }

    console.log('[AI Insights] Generated insights:', content.substring(0, 100))
    return content
  } catch (error) {
    console.error('[AI Insights] Failed to generate insights:', error)
    return null // Graceful degradation — report generates without insights
  }
}

function asOfDateFormatted(asOfDate: string): string {
  try {
    return new Date(asOfDate + 'T00:00:00Z').toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return asOfDate
  }
}
