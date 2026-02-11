'use client'

import { useState, useCallback } from 'react'
import { useQuery as useConvexQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useConvexMutationAdapter } from '@/lib/hooks/use-convex-mutation-adapter'
import type { ExpenseSubmission, SubmissionWithClaims } from '../types/expense-claims'

// ============================================
// QUERIES (Convex real-time subscriptions)
// ============================================

interface UseExpenseSubmissionsOptions {
  businessId: string
  status?: string
  enabled?: boolean
}

export function useExpenseSubmissions({ businessId, status, enabled = true }: UseExpenseSubmissionsOptions) {
  const data = useConvexQuery(
    api.functions.expenseSubmissions.list,
    enabled && businessId ? { businessId, status } : 'skip'
  )

  const isLoading = data === undefined
  const submissions: ExpenseSubmission[] = (data as ExpenseSubmission[] | undefined) || []

  return {
    submissions,
    isLoading,
    error: null as string | null,
    refetch: () => {}, // No-op: Convex subscriptions auto-update
    invalidateList: () => {}, // No-op: Convex subscriptions auto-update
  }
}

export function useSubmissionDetail(id: string | null) {
  // Use Convex real-time subscription for instant updates when claim statuses change
  const convexData = useConvexQuery(
    api.functions.expenseSubmissions.getById,
    id ? { id } : 'skip'
  )

  // Convex useQuery returns undefined while loading, null if not found
  const isLoading = convexData === undefined
  const data = convexData as SubmissionWithClaims | null | undefined

  return {
    data: data || null,
    isLoading,
    error: null as string | null,
    refetch: () => {}, // No-op: Convex subscriptions auto-update
  }
}

export function usePendingApprovals(businessId: string) {
  const data = useConvexQuery(
    api.functions.expenseSubmissions.getPendingApprovals,
    businessId ? { businessId } : 'skip'
  )

  const isLoading = data === undefined

  return {
    submissions: (data as any[]) || [],
    isLoading,
    error: null as string | null,
    refetch: () => {}, // No-op: Convex subscriptions auto-update
  }
}

export function useManagerSubmissions(businessId: string) {
  const data = useConvexQuery(
    api.functions.expenseSubmissions.getManagerSubmissions,
    businessId ? { businessId } : 'skip'
  )

  const isLoading = data === undefined

  return {
    submissions: (data as any[]) || [],
    isLoading,
    error: null as string | null,
  }
}

// ============================================
// MUTATIONS (Direct Convex calls via adapter)
// ============================================

export function useSubmissionMutations() {
  // Convex create returns a raw ID string. Consumer (submission-list.tsx)
  // handles this directly — no result mapping needed.
  const createSubmission = useConvexMutationAdapter(
    api.functions.expenseSubmissions.create,
  )

  const updateSubmission = useConvexMutationAdapter(
    api.functions.expenseSubmissions.update,
  )

  // deleteSubmission and submitForApproval: consumers pass a raw string (id),
  // but Convex mutations expect { id: string }. Wrap to preserve the consumer API.
  const softDeleteMutation = useMutation(api.functions.expenseSubmissions.softDelete)
  const [deletePending, setDeletePending] = useState(false)
  const deleteSubmissionMutateAsync = useCallback(async (id: string) => {
    setDeletePending(true)
    try { return await softDeleteMutation({ id }) }
    finally { setDeletePending(false) }
  }, [softDeleteMutation])
  const deleteSubmission = { mutateAsync: deleteSubmissionMutateAsync, isPending: deletePending }

  const submitMutation = useMutation(api.functions.expenseSubmissions.submit)
  const [submitPending, setSubmitPending] = useState(false)
  const submitForApprovalMutateAsync = useCallback(async (id: string) => {
    setSubmitPending(true)
    try { return await submitMutation({ id }) }
    finally { setSubmitPending(false) }
  }, [submitMutation])
  const submitForApproval = { mutateAsync: submitForApprovalMutateAsync, isPending: submitPending }

  const approveSubmission = useConvexMutationAdapter(
    api.functions.expenseSubmissions.approve,
  )

  const rejectSubmission = useConvexMutationAdapter(
    api.functions.expenseSubmissions.reject,
  )

  const approvePartialSubmission = useConvexMutationAdapter(
    api.functions.expenseSubmissions.approvePartial,
  )

  const removeClaim = useConvexMutationAdapter(
    api.functions.expenseSubmissions.removeClaim,
  )

  return {
    createSubmission,
    updateSubmission,
    deleteSubmission,
    submitForApproval,
    approveSubmission,
    rejectSubmission,
    approvePartialSubmission,
    removeClaim,
  }
}
