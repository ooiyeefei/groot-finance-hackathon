'use client'

import { useEffect, useRef, useCallback } from 'react'

interface UseDocumentPollingOptions {
  applicationId: string
  enabled: boolean
  onUpdate: () => void
  pollingInterval?: number
  maxPollingTime?: number
}

interface DocumentSlot {
  status: string
  document?: {
    processing_status: string // Keep for application_documents which still uses processing_status
  } | null
}

/**
 * Custom hook for polling document processing status
 * Only polls when there are documents actively being processed
 */
export function useDocumentPolling({
  applicationId,
  enabled,
  onUpdate,
  pollingInterval = 5000, // 5 seconds - much more reasonable
  maxPollingTime = 600000 // 10 minutes - increased for longer processing
}: UseDocumentPollingOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const pollingEnabledRef = useRef(false)
  const lastUpdateRef = useRef<number>(0)
  const mountedRef = useRef(true)

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    pollingEnabledRef.current = false
  }, [])

  const checkProcessingStatus = useCallback(async () => {
    // Prevent overlapping requests and rapid updates
    const now = Date.now()
    if (now - lastUpdateRef.current < 2000) { // Minimum 2 seconds between updates
      return
    }

    if (!mountedRef.current || !pollingEnabledRef.current) {
      return
    }

    try {
      const response = await fetch(`/api/applications/${applicationId}`)
      const result = await response.json()

      if (!mountedRef.current) return // Component unmounted during request

      if (result.success && result.data.slot_details) {
        const hasProcessingDocuments = result.data.slot_details.some((slot: DocumentSlot) => {
          return slot.document && isProcessingStatus(slot.document.processing_status)
        })

        // If no documents are processing, stop polling
        if (!hasProcessingDocuments) {
          console.log('[DocumentPolling] No processing documents found, stopping polling')
          clearPolling()
          lastUpdateRef.current = now
          onUpdate() // Final update
          return
        }

        // Check if we've exceeded max polling time
        if (now - startTimeRef.current > maxPollingTime) {
          console.log('[DocumentPolling] Max polling time exceeded, stopping polling')
          clearPolling()
          return
        }

        // Trigger update with debouncing
        lastUpdateRef.current = now
        onUpdate()
      }
    } catch (error) {
      console.error('[DocumentPolling] Error checking document status:', error)
      // Don't stop polling on network errors, just log and continue
      // But do update the last update time to prevent rapid retries
      lastUpdateRef.current = now
    }
  }, [applicationId, onUpdate, maxPollingTime, clearPolling])

  const startPolling = useCallback(() => {
    if (pollingEnabledRef.current || !mountedRef.current) return

    console.log('[DocumentPolling] Starting document status polling')
    pollingEnabledRef.current = true
    startTimeRef.current = Date.now()
    lastUpdateRef.current = 0 // Reset debounce timer

    // Initial check with a small delay to prevent rapid startup cycles
    setTimeout(() => {
      if (mountedRef.current && pollingEnabledRef.current) {
        checkProcessingStatus()
      }
    }, 500)

    // Start interval
    intervalRef.current = setInterval(() => {
      if (mountedRef.current && pollingEnabledRef.current) {
        checkProcessingStatus()
      }
    }, pollingInterval)
  }, [checkProcessingStatus, pollingInterval])

  // Check if a status indicates active processing
  const isProcessingStatus = (status: string): boolean => {
    return ['pending', 'classifying', 'pending_extraction', 'extracting'].includes(status)
  }

  // Effect to manage polling lifecycle
  useEffect(() => {
    mountedRef.current = true

    if (enabled) {
      startPolling()
    } else {
      clearPolling()
    }

    // Cleanup on unmount
    return () => {
      mountedRef.current = false
      clearPolling()
    }
  }, [enabled, startPolling, clearPolling])

  // Effect to handle visibility changes (pause/resume polling when tab is hidden/visible)
  useEffect(() => {
    let visibilityTimer: NodeJS.Timeout | null = null

    const handleVisibilityChange = () => {
      // Clear any pending visibility timer
      if (visibilityTimer) {
        clearTimeout(visibilityTimer)
        visibilityTimer = null
      }

      if (document.hidden && pollingEnabledRef.current) {
        console.log('[DocumentPolling] Tab hidden, pausing polling')
        clearPolling()
      } else if (!document.hidden && enabled && !pollingEnabledRef.current && mountedRef.current) {
        console.log('[DocumentPolling] Tab visible, resuming polling')
        // Add a longer delay to prevent rapid restart cycles and give time for the page to stabilize
        visibilityTimer = setTimeout(() => {
          if (mountedRef.current && enabled && !pollingEnabledRef.current) {
            startPolling()
          }
        }, 1000)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      if (visibilityTimer) {
        clearTimeout(visibilityTimer)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, startPolling, clearPolling])

  return {
    isPolling: pollingEnabledRef.current,
    stopPolling: clearPolling,
    startPolling
  }
}