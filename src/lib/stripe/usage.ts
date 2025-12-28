/**
 * OCR Usage Utilities
 *
 * Server-side utilities for checking and recording OCR usage.
 * Used by API routes and Trigger.dev tasks for billing enforcement.
 */

import { createClient } from '@supabase/supabase-js'
import { PlanName, canUseOcr, getOcrLimit, getUsagePercentage } from './plans'

// Supabase admin client for server-side operations
const getSupabaseAdmin = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface UsageCheckResult {
  canUse: boolean
  used: number
  limit: number | null
  remaining: number | null
  percentage: number
  isUnlimited: boolean
  plan: PlanName
  requiresUpgrade: boolean
}

/**
 * Check OCR usage for a business
 *
 * Use this for pre-flight checks before initiating OCR processing.
 * Returns whether usage is allowed and current stats.
 */
export async function checkOcrUsage(businessId: string): Promise<UsageCheckResult> {
  const supabase = getSupabaseAdmin()

  // Get business plan
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('plan_name')
    .eq('id', businessId)
    .single()

  if (businessError || !business) {
    throw new Error(`Business not found: ${businessId}`)
  }

  const planName = (business.plan_name as PlanName) || 'free'
  const limit = getOcrLimit(planName)

  // Get current month usage
  const { data: usageData, error: usageError } = await supabase.rpc(
    'get_monthly_ocr_usage',
    { p_business_id: businessId }
  )

  if (usageError) {
    console.error('[checkOcrUsage] Error fetching usage:', usageError.message)
  }

  const currentUsage = usageError ? 0 : (usageData ?? 0)
  const allowed = canUseOcr(planName, currentUsage)

  return {
    canUse: allowed,
    used: currentUsage,
    limit: limit === -1 ? null : limit,
    remaining: limit === -1 ? null : Math.max(0, limit - currentUsage),
    percentage: getUsagePercentage(planName, currentUsage),
    isUnlimited: limit === -1,
    plan: planName,
    requiresUpgrade: !allowed,
  }
}

export interface UsageRecordResult {
  success: boolean
  recordId?: string
  newUsage: number
  error?: string
  skipped?: boolean // True if billing was skipped (no tokens consumed)
}

/**
 * Token usage data from AI processing (Gemini API)
 * Used for billing fairness - only charge when API tokens were actually consumed
 */
export interface TokenUsageData {
  model?: string
  image_count?: number
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  has_usage_data?: boolean
}

/**
 * Record OCR usage after document processing
 *
 * BILLING FAIRNESS LOGIC:
 * - Only charges if API tokens were actually consumed (has_usage_data === true && total_tokens > 0)
 * - System errors (network failures, timeouts before API call) = no charge
 * - User errors (bad image, wrong doc type) that reach the API = charges apply
 *
 * Should be called AFTER OCR processing completes.
 * Does NOT re-check limits - assumes pre-check was done.
 *
 * @param businessId - UUID of the business consuming OCR credits
 * @param documentId - Optional UUID of the document being processed
 * @param tokenUsage - Token usage data from AI processing (determines if billing applies)
 * @param credits - Number of credits to charge (default: 1)
 */
export async function recordOcrUsage(
  businessId: string,
  documentId?: string | null,
  tokenUsage?: TokenUsageData | null,
  credits: number = 1
): Promise<UsageRecordResult> {
  const supabase = getSupabaseAdmin()

  try {
    // BILLING FAIRNESS: Only charge if API tokens were actually consumed
    const tokensConsumed = tokenUsage?.has_usage_data === true && (tokenUsage?.total_tokens ?? 0) > 0

    if (!tokensConsumed) {
      console.log(`[recordOcrUsage] ⏭️ Skipping billing - no API tokens consumed (has_usage_data: ${tokenUsage?.has_usage_data}, total_tokens: ${tokenUsage?.total_tokens ?? 0})`)
      return {
        success: true,
        newUsage: 0,
        skipped: true,
      }
    }

    // Calculate period_start (first day of current month)
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0]

    // Record usage with token details for analytics
    const { data: usageRecord, error: insertError } = await supabase
      .from('ocr_usage')
      .insert({
        business_id: businessId,
        document_id: documentId || null,
        credits_used: credits,
        period_start: periodStart,
        // Token details for internal cost analytics
        tokens_used: tokenUsage?.total_tokens ?? null,
        prompt_tokens: tokenUsage?.prompt_tokens ?? null,
        completion_tokens: tokenUsage?.completion_tokens ?? null,
        model_used: tokenUsage?.model ?? null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[recordOcrUsage] Insert failed:', insertError.message)
      return {
        success: false,
        newUsage: 0,
        error: insertError.message,
      }
    }

    // Get updated usage count
    const { data: usageData } = await supabase.rpc('get_monthly_ocr_usage', {
      p_business_id: businessId,
    })

    console.log(`[recordOcrUsage] ✅ Recorded ${credits} credit(s) for business ${businessId} (tokens: ${tokenUsage?.total_tokens})`)

    return {
      success: true,
      recordId: usageRecord.id,
      newUsage: usageData ?? credits,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[recordOcrUsage] Error:', message)
    return {
      success: false,
      newUsage: 0,
      error: message,
    }
  }
}

/**
 * Get business ID from user ID
 *
 * Helper function to resolve user's active business.
 */
export async function getBusinessIdFromUser(clerkUserId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()

  const { data: user, error } = await supabase
    .from('users')
    .select('business_id')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (error || !user?.business_id) {
    return null
  }

  return user.business_id
}
