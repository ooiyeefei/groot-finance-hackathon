import { Skeleton } from '@/components/ui/skeleton'

type PageSkeletonVariant = 'table' | 'dashboard' | 'form' | 'detail' | 'cards' | 'settings'

interface PageSkeletonProps {
  variant?: PageSkeletonVariant
  title?: string
}

function TableSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Table header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>
      {/* Filter bar */}
      <div className="border-b border-border p-3 flex gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      {/* Table rows */}
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="border-b border-border p-4 flex items-center gap-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1 max-w-48" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-6">
            <Skeleton className="h-4 w-20 mb-3" />
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Chart area */}
      <div className="bg-card border border-border rounded-lg p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
      {/* Table below */}
      <TableSkeleton />
    </div>
  )
}

function FormSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-32" />
            </div>
          ))}
        </div>
      </div>
      {/* Content section */}
      <div className="bg-card border border-border rounded-lg p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex justify-between py-3 border-b border-border last:border-0">
            <Skeleton className="h-4 flex-1 max-w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

function CardsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-6">
            <Skeleton className="h-5 w-32 mb-3" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4 mb-4" />
            <div className="flex justify-between items-center">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6 max-w-4xl">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="bg-card border border-border rounded-lg p-6">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-4 w-64 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="flex items-center justify-between py-2">
                <div>
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-12 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function PageSkeleton({ variant = 'table', title }: PageSkeletonProps) {
  const content = {
    table: <TableSkeleton />,
    dashboard: <DashboardSkeleton />,
    form: <FormSkeleton />,
    detail: <DetailSkeleton />,
    cards: <CardsSkeleton />,
    settings: <SettingsSkeleton />,
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar skeleton */}
      <div className="hidden sm:flex w-64 flex-col border-r border-border bg-card">
        <div className="p-4 border-b border-border">
          <Skeleton className="h-10 w-10 rounded-lg mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="p-3 space-y-1">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header skeleton */}
        <div className="border-b border-border bg-card px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              {title ? (
                <h1 className="text-xl font-semibold text-foreground">{title}</h1>
              ) : (
                <Skeleton className="h-6 w-40 mb-1" />
              )}
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </div>

        {/* Main content area */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 pb-24 sm:pb-4">
          <div className="max-w-7xl mx-auto">
            {content[variant]}
          </div>
        </main>
      </div>
    </div>
  )
}

export { TableSkeleton, DashboardSkeleton, FormSkeleton, DetailSkeleton, CardsSkeleton, SettingsSkeleton }
