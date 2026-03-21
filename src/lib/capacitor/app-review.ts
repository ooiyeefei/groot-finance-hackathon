/**
 * In-App Review / Rating Prompt
 *
 * Uses @capacitor-community/in-app-review to trigger the native
 * SKStoreReviewController on iOS (and Play In-App Review on Android).
 *
 * Apple best practices:
 * - Don't prompt on first launch — wait for meaningful engagement
 * - Apple throttles to ~3 prompts per 365-day period automatically
 * - Don't prompt during onboarding or error states
 * - Prompt after a positive moment (e.g. completing a task)
 *
 * Strategy: Prompt after the user has completed 5+ sessions and
 * hasn't been prompted in the last 30 days.
 */

import { isNativePlatform } from './platform'

const REVIEW_STORAGE_KEY = 'groot-app-review'
const MIN_SESSIONS = 5
const MIN_DAYS_BETWEEN_PROMPTS = 30

interface ReviewState {
  sessionCount: number
  lastPromptDate: string | null
}

function getReviewState(): ReviewState {
  if (typeof window === 'undefined') return { sessionCount: 0, lastPromptDate: null }
  try {
    const stored = localStorage.getItem(REVIEW_STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return { sessionCount: 0, lastPromptDate: null }
}

function saveReviewState(state: ReviewState): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

/**
 * Increment session count. Call once per app launch / page load.
 */
export function trackSession(): void {
  if (!isNativePlatform()) return
  const state = getReviewState()
  state.sessionCount += 1
  saveReviewState(state)
}

/**
 * Check if conditions are met and prompt for a review.
 * Safe to call liberally — Apple's SKStoreReviewController handles throttling.
 * Returns true if the prompt was triggered.
 */
export async function maybeRequestReview(): Promise<boolean> {
  if (!isNativePlatform()) return false

  const state = getReviewState()

  // Not enough sessions yet
  if (state.sessionCount < MIN_SESSIONS) return false

  // Check cooldown period
  if (state.lastPromptDate) {
    const lastPrompt = new Date(state.lastPromptDate)
    const daysSince = (Date.now() - lastPrompt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < MIN_DAYS_BETWEEN_PROMPTS) return false
  }

  try {
    const { InAppReview } = await import('@capacitor-community/in-app-review')
    await InAppReview.requestReview()

    // Record that we prompted
    state.lastPromptDate = new Date().toISOString()
    saveReviewState(state)
    return true
  } catch {
    // Silently fail — review prompt is non-critical
    return false
  }
}
