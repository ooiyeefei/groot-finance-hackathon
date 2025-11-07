/**
 * Web Vitals Monitoring Component
 *
 * Tracks Core Web Vitals and sends to analytics
 * - LCP (Largest Contentful Paint)
 * - FID (First Input Delay)
 * - CLS (Cumulative Layout Shift)
 * - FCP (First Contentful Paint)
 * - TTFB (Time to First Byte)
 */

'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { useEffect } from 'react'

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      const value = Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value)
      console.log(`[Web Vitals] ${metric.name}:`, {
        value,
        rating: metric.rating,
        id: metric.id,
        navigationType: metric.navigationType
      })
    }

    // Send to analytics endpoint (can be customized)
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType,
      page: window.location.pathname
    })

    // Use sendBeacon for reliability (doesn't block navigation)
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/vitals', body)
    } else {
      // Fallback for browsers that don't support sendBeacon
      fetch('/api/analytics/vitals', {
        method: 'POST',
        body,
        keepalive: true,
        headers: {
          'Content-Type': 'application/json'
        }
      }).catch((error) => {
        // Silently fail - don't block user experience
        console.error('[Web Vitals] Failed to send metrics:', error)
      })
    }
  })

  return null // No UI rendering needed
}

/**
 * Display Web Vitals in development mode
 * Useful for debugging performance issues
 */
export function WebVitalsDebugPanel() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return
    }

    // Show performance observer notifications in development
    console.log('[Web Vitals] Debug panel active - check console for metrics')
  }, [])

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 bg-card border border-border rounded-lg p-4 shadow-lg z-50 max-w-xs">
      <h3 className="text-sm font-semibold text-foreground mb-2">Web Vitals</h3>
      <p className="text-xs text-muted-foreground">
        Check console for real-time metrics
      </p>
      <div className="text-xs text-muted-foreground mt-2 space-y-1">
        <div>LCP: Largest Contentful Paint</div>
        <div>FID: First Input Delay</div>
        <div>CLS: Cumulative Layout Shift</div>
      </div>
    </div>
  )
}
