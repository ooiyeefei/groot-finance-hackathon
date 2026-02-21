import { cn } from '@/lib/utils'

interface ComingSoonBadgeProps {
  className?: string
}

export function ComingSoonBadge({ className }: ComingSoonBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium',
        'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse',
        className
      )}
    >
      Coming Soon
    </span>
  )
}
