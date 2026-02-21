'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useCallback } from 'react'

export interface NotificationPreferences {
  inApp: {
    approval: boolean
    anomaly: boolean
    compliance: boolean
    insight: boolean
    invoice_processing: boolean
  }
  email: {
    approval: boolean
    anomaly: boolean
    compliance: boolean
    insight: boolean
    invoice_processing: boolean
  }
  digestFrequency: 'daily' | 'weekly'
  digestTime: number
}

export function useNotificationPreferences() {
  const preferences = useQuery(api.functions.notifications.getPreferences)
  const updateMutation = useMutation(api.functions.notifications.updatePreferences)

  const updatePreferences = useCallback(async (updates: Partial<NotificationPreferences>) => {
    await updateMutation({
      inApp: updates.inApp,
      email: updates.email,
      digestFrequency: updates.digestFrequency,
      digestTime: updates.digestTime,
    })
  }, [updateMutation])

  return {
    preferences: preferences as NotificationPreferences | undefined,
    loading: preferences === undefined,
    updatePreferences,
  }
}
