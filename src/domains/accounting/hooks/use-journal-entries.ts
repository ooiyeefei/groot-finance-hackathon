'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

export function useJournalEntries() {
  const { businessId } = useActiveBusiness()

  const entries = useQuery(
    api.functions.journalEntries.list,
    businessId
      ? {
          businessId: businessId as Id<'businesses'>,
          limit: 100,
        }
      : 'skip'
  )

  const createEntry = useMutation(api.functions.journalEntries.create)
  const postEntry = useMutation(api.functions.journalEntries.post)
  const reverseEntry = useMutation(api.functions.journalEntries.reverse)

  return {
    businessId,
    entries: entries ?? [],
    isLoading: entries === undefined,
    createEntry,
    postEntry,
    reverseEntry,
  }
}
