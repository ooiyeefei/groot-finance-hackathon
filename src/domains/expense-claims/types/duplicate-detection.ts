/**
 * Duplicate Detection Types
 * Feature: 007-duplicate-expense-detection
 *
 * Types for detecting and managing duplicate expense claims
 * within a business, including cross-user duplicate detection.
 */

// Status of duplicate detection on an expense claim
export type DuplicateStatus = 'none' | 'potential' | 'confirmed' | 'dismissed'

// Match confidence tier based on field matching
export type MatchTier = 'exact' | 'strong' | 'fuzzy'

// Resolution status of a duplicate match
export type MatchStatus = 'pending' | 'confirmed_duplicate' | 'dismissed'

// Full duplicate match record stored in database
export interface DuplicateMatch {
  _id: string
  _creationTime: number
  businessId: string
  sourceClaimId: string
  matchedClaimId: string
  matchTier: MatchTier
  matchedFields: string[]
  confidenceScore: number
  isCrossUser: boolean
  status: MatchStatus
  overrideReason: string | null
  resolvedBy: string | null
  resolvedAt: number | null
}

// Result of checking for duplicates
export interface DuplicateDetectionResult {
  hasDuplicates: boolean
  matches: DuplicateMatchPreview[]
  highestTier: MatchTier | null
}

// Preview of a duplicate match for display
export interface DuplicateMatchPreview {
  matchedClaimId: string
  matchedClaimRef: string  // For display: "REP-A001014/2025"
  matchTier: MatchTier
  matchedFields: string[]
  confidenceScore: number
  isCrossUser: boolean
  matchedClaim: {
    vendorName: string
    transactionDate: string
    totalAmount: number
    currency: string
    status: string
    submittedBy: string  // User name
    createdAt: number
  }
}

// Override data when user acknowledges and proceeds despite duplicates
export interface DuplicateOverride {
  reason: string
  isSplitExpense: boolean
  acknowledgedDuplicates: string[]  // Claim IDs
}

// Request payload for checking duplicates
export interface CheckDuplicatesRequest {
  referenceNumber?: string
  vendorName: string
  transactionDate: string  // YYYY-MM-DD
  totalAmount: number
  currency: string
}

// Response from duplicate check API
export interface CheckDuplicatesResponse {
  success: true
  data: DuplicateDetectionResult
}
