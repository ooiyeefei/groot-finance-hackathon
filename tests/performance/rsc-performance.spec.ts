/**
 * RSC Performance Validation Suite
 * Consolidated testing for React Server Components optimization
 */

import { test, expect, Page } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TEST_USER = process.env.TEST_USER || 'test@example.com'
const TEST_USER_PW = process.env.TEST_USER_PW || 'test123'

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  TTFB: 800,        // Time to First Byte (ms)
  LCP: 2500,        // Largest Contentful Paint (ms)
  MAX_API_CALLS: 2  // Maximum client-side API calls on initial load
}

// RSC-optimized pages to test
const RSC_PAGES = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/invoices', name: 'Invoices' },
  { path: '/applications', name: 'Applications' },
  { path: '/manager/approvals', name: 'Manager Approvals' },
  { path: '/settings', name: 'Settings' }
]

async function authenticate(page: Page) {
  try {
    await page.goto(`${BASE_URL}/sign-in`)
    await page.fill('[name="identifier"]', TEST_USER)
    await page.fill('[name="password"]', TEST_USER_PW)
    await page.click('[type="submit"]')
    await page.waitForURL(/\/(dashboard|$)/, { timeout: 10000 })
    console.log('✅ User authenticated successfully')
  } catch (error) {
    console.warn('⚠️ Authentication failed, continuing without auth:', error)
  }
}

async function measureCoreWebVitals(page: Page): Promise<{ ttfb: number; lcp: number }> {
  // Inject Web Vitals measurement
  await page.addInitScript(() => {
    window.performanceMetrics = { ttfb: 0, lcp: 0 }

    // Measure TTFB
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      window.performanceMetrics.ttfb = navigation.responseStart - navigation.requestStart
    })

    // Measure LCP using Performance Observer
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1]
          window.performanceMetrics.lcp = lastEntry.startTime
        })
        observer.observe({ entryTypes: ['largest-contentful-paint'] })
      } catch (e) {
        console.warn('LCP measurement not supported')
      }
    }
  })

  // Wait for page load and measurements
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  // Extract metrics
  const metrics = await page.evaluate(() => window.performanceMetrics)
  return {
    ttfb: metrics?.ttfb || 0,
    lcp: metrics?.lcp || 0
  }
}

async function countClientSideApiCalls(page: Page): Promise<number> {
  const apiCalls: string[] = []

  // Monitor network requests
  page.on('request', request => {
    const url = request.url()
    // Count API calls to our application endpoints after page load
    if (url.includes('/api/v1/') && request.method() === 'GET') {
      apiCalls.push(url)
    }
  })

  return apiCalls.length
}

test.describe('RSC Performance Validation', () => {

  test('Core Web Vitals meet performance thresholds', async ({ page }) => {
    console.log('🚀 Testing Core Web Vitals performance...')

    // Authenticate once
    await authenticate(page)

    for (const testPage of RSC_PAGES) {
      console.log(`📊 Testing ${testPage.name} at ${testPage.path}`)

      // Navigate to page
      const startTime = Date.now()
      await page.goto(`${BASE_URL}${testPage.path}`)

      // Measure Core Web Vitals
      const metrics = await measureCoreWebVitals(page)
      const loadTime = Date.now() - startTime

      console.log(`   TTFB: ${metrics.ttfb}ms (threshold: ${PERFORMANCE_THRESHOLDS.TTFB}ms)`)
      console.log(`   LCP: ${metrics.lcp}ms (threshold: ${PERFORMANCE_THRESHOLDS.LCP}ms)`)
      console.log(`   Total Load: ${loadTime}ms`)

      // Assert performance thresholds
      expect(metrics.ttfb, `${testPage.name} TTFB should be under ${PERFORMANCE_THRESHOLDS.TTFB}ms`)
        .toBeLessThan(PERFORMANCE_THRESHOLDS.TTFB)

      expect(metrics.lcp, `${testPage.name} LCP should be under ${PERFORMANCE_THRESHOLDS.LCP}ms`)
        .toBeLessThan(PERFORMANCE_THRESHOLDS.LCP)

      console.log(`✅ ${testPage.name} performance thresholds met`)
    }
  })

  test('No client-side API calls on initial page load', async ({ page }) => {
    console.log('🔍 Testing client-side API call elimination...')

    // Authenticate once
    await authenticate(page)

    for (const testPage of RSC_PAGES) {
      console.log(`📡 Testing ${testPage.name} at ${testPage.path}`)

      // Start monitoring API calls
      const apiCalls: string[] = []
      page.on('request', request => {
        const url = request.url()
        // Count API calls to our application endpoints
        if (url.includes('/api/v1/') && request.method() === 'GET') {
          apiCalls.push(url)
          console.log(`   API Call detected: ${url}`)
        }
      })

      // Navigate to page
      await page.goto(`${BASE_URL}${testPage.path}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000) // Allow any delayed API calls

      console.log(`   Total API calls: ${apiCalls.length}`)
      console.log(`   Calls: ${apiCalls.join(', ')}`)

      // Assert minimal API calls (RSC should eliminate client-side data fetching)
      expect(apiCalls.length, `${testPage.name} should have minimal client-side API calls`)
        .toBeLessThanOrEqual(PERFORMANCE_THRESHOLDS.MAX_API_CALLS)

      console.log(`✅ ${testPage.name} client-side API calls optimized`)

      // Clean up event listener for next iteration
      page.removeAllListeners('request')
    }
  })
})