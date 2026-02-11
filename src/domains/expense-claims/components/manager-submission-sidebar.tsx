'use client'

import { useRouter, useParams } from 'next/navigation'
import { usePendingApprovals } from '../hooks/use-expense-submissions'
import { useActiveBusiness } from '@/contexts/business-context'
import { Send, Loader2, ChevronRight } from 'lucide-react'

interface ManagerSubmissionSidebarProps {
  currentSubmissionId: string
}

export default function ManagerSubmissionSidebar({ currentSubmissionId }: ManagerSubmissionSidebarProps) {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const { businessId } = useActiveBusiness()
  const { submissions, isLoading } = usePendingApprovals(businessId || '')

  return (
    <div className="w-72 flex-shrink-0 border-r border-border bg-surface overflow-y-auto hidden lg:block">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Send className="w-4 h-4" />
          Pending Submissions
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {isLoading ? 'Loading...' : `${submissions.length} awaiting review`}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          No pending submissions
        </div>
      ) : (
        <div className="py-2">
          {submissions.map((sub: any) => {
            const isActive = sub._id === currentSubmissionId
            return (
              <button
                key={sub._id}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer focus:outline-none ${
                  isActive
                    ? 'bg-primary/10 border-r-2 border-r-primary'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => {
                  if (!isActive) {
                    router.push(`/${locale}/manager/approvals/submissions/${sub._id}`)
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : 'text-foreground'}`}>
                    {sub.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {sub.claimCount || 0} claims
                    </span>
                    {sub.submitterName && (
                      <span className="text-xs text-muted-foreground truncate">
                        by {sub.submitterName}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className={`h-3 w-3 flex-shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
