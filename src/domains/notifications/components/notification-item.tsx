'use client'

import { CheckCircle, AlertTriangle, Shield, Lightbulb, FileText, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface NotificationItemProps {
  notification: {
    _id: string
    type: string
    severity: string
    status: string
    title: string
    body: string
    resourceUrl?: string
    createdAt: number
  }
  onMarkAsRead: (id: string) => void
  onDismiss: (id: string) => void
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  approval: CheckCircle,
  anomaly: AlertTriangle,
  compliance: Shield,
  insight: Lightbulb,
  invoice_processing: FileText,
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function NotificationItem({ notification, onMarkAsRead, onDismiss }: NotificationItemProps) {
  const router = useRouter()
  const isUnread = notification.status === 'unread'
  const Icon = TYPE_ICONS[notification.type] || Lightbulb

  const handleClick = () => {
    if (isUnread) {
      onMarkAsRead(notification._id)
    }
    if (notification.resourceUrl) {
      router.push(notification.resourceUrl)
    }
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDismiss(notification._id)
  }

  return (
    <div
      onClick={handleClick}
      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors group
        ${isUnread ? 'bg-muted/50' : 'bg-card'}
        hover:bg-muted`}
    >
      {/* Severity dot */}
      <div className="flex-shrink-0 mt-1">
        <div className={`w-2 h-2 rounded-full ${SEVERITY_COLORS[notification.severity] || SEVERITY_COLORS.info}`} />
      </div>

      {/* Type icon */}
      <div className="flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${isUnread ? 'font-semibold text-foreground' : 'text-foreground'}`}>
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {notification.body}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {getRelativeTime(notification.createdAt)}
        </p>
      </div>

      {/* Dismiss button */}
      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleDismiss}
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  )
}
