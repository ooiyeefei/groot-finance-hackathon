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
  
  // Determine color based on confidence level
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-400 border-green-400 bg-green-400/20'
    if (score >= 0.6) return 'text-yellow-400 border-yellow-400 bg-yellow-400/20'
    if (score >= 0.4) return 'text-orange-400 border-orange-400 bg-orange-400/20'
    return 'text-red-400 border-red-400 bg-red-400/20'
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

  if (score === 0 || isNaN(score)) {
    return (
      <span className={`inline-flex items-center rounded-full font-medium border text-gray-400 border-gray-600 bg-gray-800/50 ${sizeClasses[size]}`}>
        <Target className={`mr-1 ${iconSizes[size]}`} />
        No data
      </span>
    )
  }

  return (
    <div className="flex items-center space-x-2">
      <span className={`inline-flex items-center rounded-full font-medium border ${getScoreColor(normalizedScore)} ${sizeClasses[size]}`}>
        <Target className={`mr-1 ${iconSizes[size]}`} />
        {percentage}%
      </span>
      
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