import { cn } from '@/lib/utils'

interface ComingSoonBadgeProps {
  className?: string
}

export function ComingSoonBadge({ className }: ComingSoonBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium',
        'bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30',
        className
      )}
    >
      Early Access
    </span>
  )
}
