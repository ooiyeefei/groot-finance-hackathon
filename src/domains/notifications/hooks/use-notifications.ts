'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { Id } from '../../../../convex/_generated/dataModel'
import { useCallback, useState } from 'react'

export function useNotifications(businessId: string | null) {
  const [cursor, setCursor] = useState<number | undefined>(undefined)

  const convexBusinessId = businessId as Id<"businesses"> | null

  const notifications = useQuery(
    api.functions.notifications.listForUser,
    convexBusinessId ? { businessId: convexBusinessId, cursor } : "skip"
  )

  const unreadCount = useQuery(
    api.functions.notifications.getUnreadCount,
    convexBusinessId ? { businessId: convexBusinessId } : "skip"
  )

  const markAsReadMutation = useMutation(api.functions.notifications.markAsRead)
  const markAllAsReadMutation = useMutation(api.functions.notifications.markAllAsRead)
  const dismissMutation = useMutation(api.functions.notifications.dismiss)

  const markAsRead = useCallback(async (id: string) => {
    await markAsReadMutation({ notificationId: id as Id<"notifications"> })
  }, [markAsReadMutation])

  const markAllAsRead = useCallback(async () => {
    if (!convexBusinessId) return
    await markAllAsReadMutation({ businessId: convexBusinessId })
  }, [markAllAsReadMutation, convexBusinessId])

  const dismiss = useCallback(async (id: string) => {
    await dismissMutation({ notificationId: id as Id<"notifications"> })
  }, [dismissMutation])

  const loadMore = useCallback(() => {
    if (notifications?.notifications && notifications.notifications.length > 0) {
      const lastNotification = notifications.notifications[notifications.notifications.length - 1]
      setCursor(lastNotification.createdAt)
    }
  }, [notifications])

  return {
    notifications: notifications?.notifications ?? [],
    unreadCount: unreadCount ?? 0,
    loading: notifications === undefined,
    markAsRead,
    markAllAsRead,
    dismiss,
    loadMore,
    hasMore: notifications?.hasMore ?? false,
  }
}
