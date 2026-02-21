'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NotificationPanel } from './notification-panel'
import { useNotifications } from '../hooks/use-notifications'

interface NotificationBellProps {
  businessId: string | null
}

export function NotificationBell({ businessId }: NotificationBellProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const { unreadCount } = useNotifications(businessId)

  if (!businessId) return null

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        onClick={() => setPanelOpen(true)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      <NotificationPanel
        businessId={businessId}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </>
  )
}
