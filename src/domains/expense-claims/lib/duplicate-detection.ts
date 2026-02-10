/**
 * Duplicate Detection Algorithm
 * Feature: 007-duplicate-expense-detection
 *
 * Multi-tier matching strategy:
 * - Early exit: Different reference numbers → NOT a duplicate
 * - Tier 1 (Exact): Receipt/reference number match
 * - Tier 2 (Strong): Vendor + Date + Amount exact match
 * - Tier 3 (Fuzzy): Normalized vendor + Date + Amount exact match
 */

import {
  vendorNamesMatch,
} from './vendor-normalizer'
import type {
  DuplicateDetectionResult,
  DuplicateMatchPreview,
  MatchTier,
} from '../types/duplicate-detection'

interface ExpenseClaimCandidate {
  _id: string
  userId: string
  vendorName: string | null
  transactionDate: string | null
  totalAmount: number | null
  currency: string | null
  referenceNumber: string | null
  status: string
  _creationTime: number
  // For display
  submittedByName?: string
}

interface CheckDuplicatesInput {
  currentUserId: string
  referenceNumber?: string | null
  vendorName: string
  transactionDate: string
  totalAmount: number
  currency: string
  existingClaims: ExpenseClaimCandidate[]
}

/**
 * Check for duplicate expense claims
 * Returns matches sorted by confidence (highest first)
 */
export function checkForDuplicates(
  input: CheckDuplicatesInput
): DuplicateDetectionResult {
  const matches: DuplicateMatchPreview[] = []

  // Filter out rejected/failed claims (per spec clarification)
  const eligibleClaims = input.existingClaims.filter(
    (claim) => !['rejected', 'failed'].includes(claim.status)
  )

  for (const claim of eligibleClaims) {
    const match = checkSingleClaim(input, claim)
    if (match) {
      matches.push(match)
    }
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidenceScore - a.confidenceScore)

  // Determine highest tier
  let highestTier: MatchTier | null = null
  if (matches.length > 0) {
    highestTier = matches[0].matchTier
  }

  return {
    hasDuplicates: matches.length > 0,
    matches,
    highestTier,
  }
}

function checkSingleClaim(
  input: CheckDuplicatesInput,
  claim: ExpenseClaimCandidate
): DuplicateMatchPreview | null {
  const isCrossUser = claim.userId !== input.currentUserId

  // Tier 1: Exact reference number match
  if (input.referenceNumber && claim.referenceNumber) {
    if (
      input.referenceNumber.toLowerCase() === claim.referenceNumber.toLowerCase()
    ) {
      return createMatch(claim, 'exact', ['referenceNumber'], 1.0, isCrossUser)
    }
    // Both claims have reference numbers but they differ → definitively NOT a duplicate.
    // Different receipt numbers prove these are separate transactions regardless of
    // vendor/date/amount similarity (e.g., repeat purchases at the same shop).
    return null
  }

  // Tier 2: Strong match - exact vendor + date + amount
  if (
    claim.vendorName &&
    claim.transactionDate &&
    claim.totalAmount !== null
  ) {
    const vendorExact =
      input.vendorName.toLowerCase() === claim.vendorName.toLowerCase()
    const dateExact = input.transactionDate === claim.transactionDate
    const amountExact = input.totalAmount === claim.totalAmount

    if (vendorExact && dateExact && amountExact) {
      return createMatch(
        claim,
        'strong',
        ['vendorName', 'transactionDate', 'totalAmount'],
        0.9,
        isCrossUser
      )
    }
  }

  // Tier 3: Fuzzy match - normalized vendor + exact date + exact amount
  // Only vendor name comparison is fuzzy (handles variations like "Starbucks" vs
  // "STARBUCKS COFFEE SDN BHD"). Date and amount must match exactly because
  // same vendor on different days or with different amounts = legitimate repeat purchase.
  if (
    claim.vendorName &&
    claim.transactionDate &&
    claim.totalAmount !== null
  ) {
    const vendorFuzzy = vendorNamesMatch(input.vendorName, claim.vendorName)
    const dateExact = input.transactionDate === claim.transactionDate
    const amountExact = input.totalAmount === claim.totalAmount

    if (vendorFuzzy && dateExact && amountExact) {
      return createMatch(
        claim,
        'fuzzy',
        ['vendorName', 'transactionDate', 'totalAmount'],
        0.7,
        isCrossUser
      )
    }
  }

  return null
}

function createMatch(
  claim: ExpenseClaimCandidate,
  tier: MatchTier,
  fields: string[],
  confidence: number,
  isCrossUser: boolean
): DuplicateMatchPreview {
  return {
    matchedClaimId: claim._id,
    matchedClaimRef: claim.referenceNumber || claim._id.slice(0, 8),
    matchTier: tier,
    matchedFields: fields,
    confidenceScore: confidence,
    isCrossUser,
    matchedClaim: {
      vendorName: claim.vendorName || 'Unknown',
      transactionDate: claim.transactionDate || '',
      totalAmount: claim.totalAmount || 0,
      currency: claim.currency || 'MYR',
      status: claim.status,
      submittedBy: claim.submittedByName || 'Unknown',
      createdAt: claim._creationTime,
    },
  }
}

/**
 * Get confidence score for a match tier
 */
export function getConfidenceForTier(tier: MatchTier): number {
  switch (tier) {
    case 'exact':
      return 1.0
    case 'strong':
      return 0.9
    case 'fuzzy':
      return 0.7
    default:
      return 0.5
  }
}

/**
 * Get human-readable description of match tier
 */
export function getMatchTierDescription(tier: MatchTier): string {
  switch (tier) {
    case 'exact':
      return 'Exact match - same receipt/reference number'
    case 'strong':
      return 'Strong match - same vendor, date, and amount'
    case 'fuzzy':
      return 'Possible match - similar vendor, date, and amount'
    default:
      return 'Unknown match type'
  }
}
