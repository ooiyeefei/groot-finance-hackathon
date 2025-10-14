'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface ProcessingExpenseClaim {
  id: string
  documentId?: string
  fileName: string
  fileType: string
  status: 'uploading' | 'processing' | 'analyzing' | 'completed' | 'failed'
  progress: number
  startTime: Date
  expectedDuration: number // in seconds
  taskId?: string
  error?: string
  extractionResult?: any
}

interface UseExpenseClaimProcessingReturn {
  processingClaims: ProcessingExpenseClaim[]
  addProcessingClaim: (file: File, taskId?: string) => string
  updateClaimStatus: (claimId: string, updates: Partial<ProcessingExpenseClaim>) => void
  removeProcessingClaim: (claimId: string) => void
  getProcessingClaim: (claimId: string) => ProcessingExpenseClaim | undefined
  hasActiveProcessing: boolean
}

export function useExpenseClaimProcessing(): UseExpenseClaimProcessingReturn {
  const [processingClaims, setProcessingClaims] = useState<ProcessingExpenseClaim[]>([])
  const pollingInterval = useRef<NodeJS.Timeout | null>(null)

  // Add a new processing claim to the queue
  const addProcessingClaim = useCallback((file: File, taskId?: string): string => {
    const claimId = `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const newClaim: ProcessingExpenseClaim = {
      id: claimId,
      fileName: file.name,
      fileType: file.type,
      status: 'uploading',
      progress: 0,
      startTime: new Date(),
      expectedDuration: 15,
      taskId,
    }

    setProcessingClaims(prev => [...prev, newClaim])

    // Start progress simulation immediately
    simulateProgress(claimId)

    return claimId
  }, [])

  // Update processing claim status
  const updateClaimStatus = useCallback((claimId: string, updates: Partial<ProcessingExpenseClaim>) => {
    setProcessingClaims(prev => prev.map(claim =>
      claim.id === claimId
        ? { ...claim, ...updates }
        : claim
    ))
  }, [])

  // Remove processing claim from queue
  const removeProcessingClaim = useCallback((claimId: string) => {
    setProcessingClaims(prev => prev.filter(claim => claim.id !== claimId))
  }, [])

  // Get specific processing claim
  const getProcessingClaim = useCallback((claimId: string): ProcessingExpenseClaim | undefined => {
    return processingClaims.find(claim => claim.id === claimId)
  }, [processingClaims])

  // Check if there are any active processing claims
  const hasActiveProcessing = processingClaims.some(claim =>
    claim.status === 'uploading' || claim.status === 'processing' || claim.status === 'analyzing'
  )

  // Simulate realistic progress for expense claim processing
  const simulateProgress = useCallback(async (claimId: string) => {
    let currentProgress = 0
    const progressInterval = setInterval(() => {
      currentProgress += Math.random() * 10 + 5 // Increment by 5-15% each time

      setProcessingClaims(prev => prev.map(claim => {
        if (claim.id !== claimId) return claim

        // Update status based on progress
        let newStatus = claim.status
        if (currentProgress >= 20 && claim.status === 'uploading') {
          newStatus = 'processing'
        } else if (currentProgress >= 60 && claim.status === 'processing') {
          newStatus = 'analyzing'
        }

        return {
          ...claim,
          progress: Math.min(currentProgress, 95), // Cap at 95% until completion
          status: newStatus
        }
      }))

      // Stop simulation at 95% - wait for actual completion
      if (currentProgress >= 95) {
        clearInterval(progressInterval)
      }
    }, 800) // Update every 800ms for smooth progress

    // Cleanup interval after 20 seconds max
    setTimeout(() => {
      clearInterval(progressInterval)
    }, 20000)
  }, [])

  // Poll for task completion if we have taskIds
  const pollTaskCompletion = useCallback(async () => {
    const claimsWithTasks = processingClaims.filter(claim =>
      claim.taskId && (claim.status === 'processing' || claim.status === 'analyzing')
    )

    if (claimsWithTasks.length === 0) return

    for (const claim of claimsWithTasks) {
      try {
        const response = await fetch(`/api/v1/tasks/${claim.taskId}/status`)
        if (response.ok) {
          const result = await response.json()

          if (result.success && result.data) {
            const taskData = result.data

            // Task completed successfully
            if (taskData.processing_complete && taskData.is_success && taskData.extraction_result) {
              updateClaimStatus(claim.id, {
                status: 'completed',
                progress: 100,
                extractionResult: taskData.extraction_result
              })
            }
            // Task failed
            else if (taskData.status === 'failed') {
              updateClaimStatus(claim.id, {
                status: 'failed',
                progress: 0,
                error: taskData.error || 'Processing failed'
              })
            }
          }
        }
      } catch (error) {
        console.error(`Error polling task ${claim.taskId}:`, error)
      }
    }
  }, [processingClaims, updateClaimStatus])

  // Start polling for task completion
  const startPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
    }

    pollingInterval.current = setInterval(() => {
      pollTaskCompletion()
    }, 3000) // Poll every 3 seconds
  }, [pollTaskCompletion])

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
      pollingInterval.current = null
    }
  }, [])

  // Auto-remove completed or failed claims after 10 seconds
  useEffect(() => {
    processingClaims.forEach(claim => {
      if (claim.status === 'completed' || claim.status === 'failed') {
        setTimeout(() => {
          removeProcessingClaim(claim.id)
        }, 10000) // Remove after 10 seconds
      }
    })
  }, [processingClaims, removeProcessingClaim])

  // Start/stop polling based on active processing claims
  useEffect(() => {
    if (hasActiveProcessing) {
      startPolling()
    } else {
      stopPolling()
    }

    return () => stopPolling()
  }, [hasActiveProcessing, startPolling, stopPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return {
    processingClaims,
    addProcessingClaim,
    updateClaimStatus,
    removeProcessingClaim,
    getProcessingClaim,
    hasActiveProcessing
  }
}