/**
 * Applications Domain Hook
 * Custom React hooks for managing applications data with TanStack Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useActiveBusiness } from '@/contexts/business-context'

interface Application {
  id: string
  title: string
  description: string
  status: 'draft' | 'processing' | 'completed' | 'failed' | 'needs_review'
  application_type: string
  progress_percentage: number
  slots_filled: number
  slots_total: number
  created_at: string
  application_types: {
    display_name: string
    description: string
  }
  slot_status?: Array<{
    slot: string
    display_name: string
    is_critical: boolean
    status: string
    document_id: string | null
    uploaded_at: string | null
  }>
}

// Fetch function for TanStack Query
const fetchApplications = async () => {
  const response = await fetch('/api/v1/applications')

  if (!response.ok) {
    throw new Error(`Applications request failed: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch applications')
  }

  return result.data
}

/**
 * Hook to fetch applications list with TanStack Query
 */
export function useGetApplications() {
  const { businessId } = useActiveBusiness()

  return useQuery({
    queryKey: ['applications', businessId],
    queryFn: fetchApplications,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (error instanceof Error && error.message.includes('failed: 4')) {
        return false
      }
      return failureCount < 3
    },
    enabled: !!businessId // Only fetch when businessId is available
  })
}

/**
 * Hook to create a new application
 */
export function useCreateApplication() {
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { businessId } = useActiveBusiness()

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'New Application',
          description: '',
          application_type: 'personal_loan'
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create application')
      }

      return result.data
    },
    onSuccess: async (newApplication) => {
      // Update the title with ID
      await fetch(`/api/v1/applications/${newApplication.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: `app-${newApplication.id.split('-')[0]}`
        })
      })

      // Navigate to new application
      router.push(`/${locale}/applications/${newApplication.id}`)
    },
    onError: (error) => {
      console.error('Error creating application:', error)
    }
  })
}

/**
 * Hook to delete an application
 */
export function useDeleteApplication() {
  const queryClient = useQueryClient()
  const { businessId } = useActiveBusiness()

  return useMutation({
    mutationFn: async (applicationId: string) => {
      const response = await fetch(`/api/v1/applications/${applicationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete application')
      }

      return result
    },
    onSuccess: () => {
      // Refetch applications after delete
      queryClient.invalidateQueries({ queryKey: ['applications', businessId] })
    },
    onError: (error) => {
      console.error('Error deleting application:', error)
    }
  })
}
