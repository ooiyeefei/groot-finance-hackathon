'use client'

import { Target } from 'lucide-react'

interface ConfidenceScoreMeterProps {
  score: number
  entityCount?: number
  size?: 'sm' | 'md' | 'lg'
}

export default function ConfidenceScoreMeter({ 
  score, 
  entityCount, 
  size = 'sm' 
}: ConfidenceScoreMeterProps) {
  // Ensure score is between 0 and 1
  const normalizedScore = Math.max(0, Math.min(1, score))
  const percentage = Math.round(normalizedScore * 100)
  
  // Determine variant based on confidence level - using semantic Badge variants
  const getScoreVariant = (score: number) => {
    if (score >= 0.8) return 'success' as const
    if (score >= 0.6) return 'warning' as const
    if (score >= 0.4) return 'warning' as const
    return 'error' as const
  }

  const getProgressColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-400'
    if (score >= 0.6) return 'bg-yellow-400'
    if (score >= 0.4) return 'bg-orange-400'
    return 'bg-red-400'
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2'
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  }

  // Map score to CSS class
  const getScoreCSSClass = (score: number) => {
    if (score >= 0.8) return 'badge-success-status'
    if (score >= 0.6) return 'badge-warning-status'
    if (score >= 0.4) return 'badge-warning-status'
    return 'badge-error-status'
  }

  if (score === 0 || isNaN(score)) {
    return (
      <div className="badge-info-metadata inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors">
        <Target className={`mr-1 ${iconSizes[size]}`} />
        No data
      </div>
    )
  }

  return (
    <div className="flex items-center space-x-2">
      <div className={`${getScoreCSSClass(normalizedScore)} inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors`}>
        <Target className={`mr-1 ${iconSizes[size]}`} />
        {percentage}%
      </div>
      
      {/* Progress bar for medium and large sizes */}
      {size !== 'sm' && (
        <div className="flex-1 max-w-20">
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-500 ${getProgressColor(normalizedScore)}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      )}
      
      {/* Entity count for context */}
      {entityCount && entityCount > 0 && size !== 'sm' && (
        <span className="text-xs text-gray-400">
          {entityCount} items
        </span>
      )}
    </div>
  )
}