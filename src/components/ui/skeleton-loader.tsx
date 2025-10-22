interface SkeletonLoaderProps {
  variant?: 'card' | 'list' | 'dashboard' | 'chat'
  count?: number
  className?: string
}

export default function SkeletonLoader({ 
  variant = 'card', 
  count = 3, 
  className = '' 
}: SkeletonLoaderProps) {
  
  const renderCardSkeleton = () => (
    <div className="bg-record-layer-1 border border-record-border rounded-lg p-6 animate-pulse">
      <div className="h-4 bg-record-layer-2 rounded w-20 mb-3"></div>
      <div className="h-8 bg-record-layer-2 rounded w-32 mb-2"></div>
      <div className="h-3 bg-record-layer-2 rounded w-16"></div>
    </div>
  )

  const renderListSkeleton = () => (
    <div className="bg-record-layer-1 border border-record-border rounded-lg p-4 animate-pulse">
      <div className="flex items-center space-x-4">
        <div className="w-10 h-10 bg-record-layer-2 rounded"></div>
        <div className="flex-1">
          <div className="h-4 bg-record-layer-2 rounded w-32 mb-2"></div>
          <div className="h-3 bg-record-layer-2 rounded w-20"></div>
        </div>
        <div className="h-6 bg-record-layer-2 rounded w-16"></div>
      </div>
    </div>
  )

  const renderDashboardSkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="bg-record-layer-1 border border-record-border rounded-lg p-6 animate-pulse">
          <div className="h-4 bg-record-layer-2 rounded w-20 mb-3"></div>
          <div className="h-8 bg-record-layer-2 rounded w-32 mb-2"></div>
          <div className="h-3 bg-record-layer-2 rounded w-16"></div>
        </div>
      ))}
    </div>
  )

  const renderChatSkeleton = () => (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-start space-x-3">
        <div className="w-8 h-8 bg-record-layer-2 rounded-full"></div>
        <div className="bg-record-layer-2 rounded-lg p-4 max-w-xs">
          <div className="h-4 bg-record-layer-3 rounded mb-2"></div>
          <div className="h-4 bg-record-layer-3 rounded w-3/4"></div>
        </div>
      </div>
      <div className="flex items-start space-x-3 justify-end">
        <div className="bg-record-layer-2 rounded-lg p-4 max-w-xs">
          <div className="h-4 bg-record-layer-3 rounded"></div>
        </div>
        <div className="w-8 h-8 bg-record-layer-2 rounded-full"></div>
      </div>
    </div>
  )

  const getSkeletonContent = () => {
    switch (variant) {
      case 'dashboard':
        return renderDashboardSkeleton()
      case 'chat':
        return renderChatSkeleton()
      case 'list':
        return (
          <div className="space-y-4">
            {Array.from({ length: count }, (_, i) => (
              <div key={i}>{renderListSkeleton()}</div>
            ))}
          </div>
        )
      case 'card':
      default:
        return (
          <div className="grid gap-4">
            {Array.from({ length: count }, (_, i) => (
              <div key={i}>{renderCardSkeleton()}</div>
            ))}
          </div>
        )
    }
  }

  return (
    <div className={className}>
      {getSkeletonContent()}
    </div>
  )
}