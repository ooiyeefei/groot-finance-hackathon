/**
 * Loading Skeletons for Accounting Entries
 *
 * Prevents Cumulative Layout Shift (CLS) by reserving exact space
 * for content before it loads
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Single accounting entry row skeleton
 * Height: 72px (matches real entry row)
 */
export function EntryRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border border-border rounded-lg h-[72px] bg-card">
      {/* Status badge placeholder */}
      <div className="w-20">
        <Skeleton className="h-6 w-16" />
      </div>

      {/* Main content */}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-3 w-[150px]" />
      </div>

      {/* Amount placeholder */}
      <div className="w-32 text-right">
        <Skeleton className="h-6 w-24 ml-auto" />
      </div>

      {/* Actions placeholder */}
      <div className="w-20">
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  )
}

/**
 * Full list of entry skeletons
 * Shows 10 rows by default (matches initial page size)
 */
export function EntriesListSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <EntryRowSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Page header skeleton
 * Matches accounting entries page header layout
 */
export function PageHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-[200px]" />
        <Skeleton className="h-4 w-[300px]" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-10 w-[120px]" />
        <Skeleton className="h-10 w-[100px]" />
      </div>
    </div>
  )
}

/**
 * Filter bar skeleton
 */
export function FilterBarSkeleton() {
  return (
    <div className="flex items-center gap-4 mb-6 p-4 bg-surface rounded-lg border border-border">
      <Skeleton className="h-10 w-[200px]" />
      <Skeleton className="h-10 w-[150px]" />
      <Skeleton className="h-10 w-[150px]" />
      <Skeleton className="h-10 w-[120px]" />
    </div>
  )
}

/**
 * Complete accounting entries page skeleton
 * Matches full page layout to prevent CLS
 */
export function AccountingEntriesPageSkeleton() {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar skeleton */}
      <div className="w-64 bg-surface border-r border-border">
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header skeleton */}
        <div className="bg-surface border-b border-border p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-[250px]" />
              <Skeleton className="h-4 w-[350px]" />
            </div>
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>

        {/* Main content area */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <PageHeaderSkeleton />
            <FilterBarSkeleton />
            <EntriesListSkeleton count={10} />
          </div>
        </main>
      </div>
    </div>
  )
}

/**
 * Compact card skeleton for dashboard widgets
 */
export function EntryCardSkeleton() {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <Skeleton className="h-6 w-[180px]" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-6 w-[80px]" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-[120px]" />
          <Skeleton className="h-4 w-[60px]" />
        </div>
      </CardContent>
    </Card>
  )
}
