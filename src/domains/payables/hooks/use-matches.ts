'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

interface MatchFilters {
  status?: 'auto_approved' | 'pending_review' | 'approved' | 'disputed' | 'on_hold'
  purchaseOrderId?: Id<'purchase_orders'>
}

export function useMatches(filters: MatchFilters = {}) {
  const { businessId } = useActiveBusiness()

  const matches = useQuery(
    api.functions.poMatches.list,
    businessId
      ? {
          businessId: businessId as Id<'businesses'>,
          status: filters.status,
          purchaseOrderId: filters.purchaseOrderId,
        }
      : 'skip'
  )

  return {
    matches: matches ?? [],
    isLoading: matches === undefined,
  }
}

export function useMatch(matchId: Id<'po_matches'> | null) {
  const match = useQuery(
    api.functions.poMatches.get,
    matchId ? { matchId } : 'skip'
  )

  return {
    match: match ?? null,
    isLoading: matchId !== null && match === undefined,
  }
}

export function useMatchDashboard() {
  const { businessId } = useActiveBusiness()

  const summary = useQuery(
    api.functions.poMatches.getDashboardSummary,
    businessId
      ? { businessId: businessId as Id<'businesses'> }
      : 'skip'
  )

  return {
    summary: summary ?? null,
    isLoading: summary === undefined,
  }
}

export function useUnmatched(tab: 'pos_without_invoices' | 'invoices_without_pos' | 'pos_without_grns') {
  const { businessId } = useActiveBusiness()

  const unmatched = useQuery(
    api.functions.poMatches.getUnmatched,
    businessId
      ? {
          businessId: businessId as Id<'businesses'>,
          tab,
        }
      : 'skip'
  )

  return {
    items: unmatched ?? [],
    isLoading: unmatched === undefined,
  }
}

export function useReviewMatch() {
  const reviewMutation = useMutation(api.functions.poMatches.review)

  return {
    reviewMatch: reviewMutation,
  }
}

export function useCreateManualMatch() {
  const createMutation = useMutation(api.functions.poMatches.createManual)

  return {
    createManualMatch: createMutation,
  }
}

export function useMarkNoMatchRequired() {
  const markMutation = useMutation(api.functions.poMatches.markNoMatchRequired)

  return {
    markNoMatchRequired: markMutation,
  }
}
