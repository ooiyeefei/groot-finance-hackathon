'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ExpenseSubmission, SubmissionWithClaims } from '../types/expense-claims'

// Query keys
const SUBMISSION_KEYS = {
  all: ['expense-submissions'] as const,
  lists: () => [...SUBMISSION_KEYS.all, 'list'] as const,
  list: (businessId: string, status?: string) => [...SUBMISSION_KEYS.lists(), businessId, status] as const,
  details: () => [...SUBMISSION_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...SUBMISSION_KEYS.details(), id] as const,
  pendingApprovals: (businessId: string) => [...SUBMISSION_KEYS.all, 'pending-approvals', businessId] as const,
}

// API helpers
async function fetchSubmissions(businessId: string, status?: string) {
  const params = new URLSearchParams({ businessId })
  if (status) params.set('status', status)
  const response = await fetch(`/api/v1/expense-submissions?${params}`)
  if (!response.ok) throw new Error('Failed to fetch submissions')
  return response.json()
}

async function fetchSubmissionDetail(id: string): Promise<SubmissionWithClaims> {
  const response = await fetch(`/api/v1/expense-submissions/${id}`)
  if (!response.ok) throw new Error('Failed to fetch submission')
  return response.json()
}

async function fetchPendingApprovals(businessId: string) {
  const response = await fetch(`/api/v1/expense-submissions/pending-approvals?businessId=${businessId}`)
  if (!response.ok) throw new Error('Failed to fetch pending approvals')
  return response.json()
}

interface UseExpenseSubmissionsOptions {
  businessId: string
  status?: string
  enabled?: boolean
}

export function useExpenseSubmissions({ businessId, status, enabled = true }: UseExpenseSubmissionsOptions) {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: SUBMISSION_KEYS.list(businessId, status),
    queryFn: () => fetchSubmissions(businessId, status),
    enabled: enabled && !!businessId,
    staleTime: 60_000, // 1 minute
  })

  const submissions: ExpenseSubmission[] = data?.submissions || []

  const invalidateList = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: SUBMISSION_KEYS.lists() })
  }, [queryClient])

  return {
    submissions,
    isLoading,
    error: error?.message || null,
    refetch,
    invalidateList,
  }
}

export function useSubmissionDetail(id: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: SUBMISSION_KEYS.detail(id || ''),
    queryFn: () => fetchSubmissionDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  })

  return {
    data: data || null,
    isLoading,
    error: error?.message || null,
    refetch,
  }
}

export function usePendingApprovals(businessId: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: SUBMISSION_KEYS.pendingApprovals(businessId),
    queryFn: () => fetchPendingApprovals(businessId),
    enabled: !!businessId,
    staleTime: 60_000,
  })

  return {
    submissions: data?.submissions || [],
    isLoading,
    error: error?.message || null,
    refetch,
  }
}

export function useSubmissionMutations() {
  const queryClient = useQueryClient()

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: SUBMISSION_KEYS.all })
  }, [queryClient])

  const createSubmission = useMutation({
    mutationFn: async ({ businessId, title }: { businessId: string; title?: string }) => {
      const response = await fetch('/api/v1/expense-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, title }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error?.error?.message || 'Failed to create submission')
      }
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  const updateSubmission = useMutation({
    mutationFn: async ({ id, title, description }: { id: string; title?: string; description?: string }) => {
      const response = await fetch(`/api/v1/expense-submissions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error?.error?.message || 'Failed to update submission')
      }
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  const deleteSubmission = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/expense-submissions/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error?.error?.message || 'Failed to delete submission')
      }
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  const submitForApproval = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/expense-submissions/${id}/submit`, {
        method: 'POST',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error?.error?.message || 'Failed to submit')
      }
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  const approveSubmission = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const response = await fetch(`/api/v1/expense-submissions/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error?.error?.message || 'Failed to approve')
      }
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  const rejectSubmission = useMutation({
    mutationFn: async ({ id, reason, claimNotes }: { id: string; reason: string; claimNotes?: Array<{ claimId: string; note: string }> }) => {
      const response = await fetch(`/api/v1/expense-submissions/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, claimNotes }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error?.error?.message || 'Failed to reject')
      }
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  const removeClaim = useMutation({
    mutationFn: async ({ submissionId, claimId }: { submissionId: string; claimId: string }) => {
      const response = await fetch(`/api/v1/expense-submissions/${submissionId}/claims/${claimId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error?.error?.message || 'Failed to remove claim')
      }
      return response.json()
    },
    onSuccess: invalidateAll,
  })

  return {
    createSubmission,
    updateSubmission,
    deleteSubmission,
    submitForApproval,
    approveSubmission,
    rejectSubmission,
    removeClaim,
  }
}
