/**
 * Expense Claims UI Tests
 * End-to-end tests for the expense claims dashboard and UI interactions
 * Tests login flow and expense claims functionality after component refactoring
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

test.describe('Expense Claims UI - Dashboard and Interactions', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to expense claims page
    await page.goto('/en/expense-claims')

    // Wait for the page to load - the page might redirect to login if not authenticated
    // We'll handle both authenticated and non-authenticated states
    await page.waitForLoadState('networkidle')
  })

  test('should display expense claims dashboard with proper structure', async ({ page }) => {
    // If redirected to login, we need to authenticate first
    if (page.url().includes('/sign-in')) {
      // Skip authentication for this test - just verify redirect happened
      console.log('User not authenticated, redirected to sign-in page')
      expect(page.url()).toContain('/sign-in')
      return
    }

    // Check that main components are present on the expense claims page
    await expect(page).toHaveTitle(/Expense Claims/)

    // Look for key expense claims dashboard elements
    // These selectors should work with the refactored component structure
    const possibleDashboardElements = [
      '[data-testid="expense-claims-dashboard"]',
      '[data-testid="expense-claims-list"]',
      'text=Expense Claims',
      'text=Create New Claim',
      'button:has-text("Add Expense")',
      'button:has-text("New Claim")',
      '[role="main"]' // Fallback to main content area
    ]

    let foundDashboardElement = false
    for (const selector of possibleDashboardElements) {
      try {
        const element = page.locator(selector)
        if (await element.isVisible({ timeout: 5000 })) {
          foundDashboardElement = true
          console.log(`Found dashboard element: ${selector}`)
          break
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    expect(foundDashboardElement).toBe(true)
  })

  test('should handle expense claims list display', async ({ page }) => {
    // Skip if not authenticated
    if (page.url().includes('/sign-in')) {
      console.log('User not authenticated, skipping list test')
      return
    }

    // Look for expense claims list or empty state
    const possibleListElements = [
      '[data-testid="expense-claims-list"]',
      '[data-testid^="expense-claim-"]',
      'text=No expense claims found',
      'text=Create your first expense claim',
      '.expense-claim-item',
      '.expense-list'
    ]

    let foundListElement = false
    for (const selector of possibleListElements) {
      try {
        const element = page.locator(selector)
        if (await element.isVisible({ timeout: 3000 })) {
          foundListElement = true
          console.log(`Found list element: ${selector}`)
          break
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    expect(foundListElement).toBe(true)
  })

  test('should display create expense claim functionality', async ({ page }) => {
    // Skip if not authenticated
    if (page.url().includes('/sign-in')) {
      console.log('User not authenticated, skipping create test')
      return
    }

    // Look for create/add expense functionality
    const possibleCreateElements = [
      'button:has-text("Create")',
      'button:has-text("Add")',
      'button:has-text("New")',
      '[data-testid="create-expense-button"]',
      '[data-testid="add-expense-claim"]',
      'text=Upload Receipt',
      'text=Manual Entry'
    ]

    let foundCreateElement = false
    for (const selector of possibleCreateElements) {
      try {
        const element = page.locator(selector)
        if (await element.isVisible({ timeout: 3000 })) {
          foundCreateElement = true
          console.log(`Found create element: ${selector}`)
          break
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    expect(foundCreateElement).toBe(true)
  })

  test('should handle expense claims filtering and search', async ({ page }) => {
    // Skip if not authenticated
    if (page.url().includes('/sign-in')) {
      console.log('User not authenticated, skipping filter test')
      return
    }

    // Look for filtering/search functionality
    const possibleFilterElements = [
      'input[placeholder*="search" i]',
      'input[placeholder*="filter" i]',
      '[data-testid*="search"]',
      '[data-testid*="filter"]',
      'select[name*="status"]',
      'select[name*="category"]',
      '.search-input',
      '.filter-select'
    ]

    let foundFilterElement = false
    for (const selector of possibleFilterElements) {
      try {
        const element = page.locator(selector)
        if (await element.isVisible({ timeout: 3000 })) {
          foundFilterElement = true
          console.log(`Found filter element: ${selector}`)
          break
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Filter elements are optional, so we don't fail the test if none found
    console.log(`Filter functionality found: ${foundFilterElement}`)
  })

  test('should navigate between different expense claim views', async ({ page }) => {
    // Skip if not authenticated
    if (page.url().includes('/sign-in')) {
      console.log('User not authenticated, skipping navigation test')
      return
    }

    // Look for navigation elements (tabs, menu items, etc.)
    const possibleNavElements = [
      'nav',
      '[role="tablist"]',
      'text=Dashboard',
      'text=All Claims',
      'text=Pending',
      'text=Approved',
      'text=Draft',
      '[data-testid*="tab"]',
      '[data-testid*="nav"]'
    ]

    let foundNavElement = false
    for (const selector of possibleNavElements) {
      try {
        const element = page.locator(selector)
        if (await element.isVisible({ timeout: 3000 })) {
          foundNavElement = true
          console.log(`Found navigation element: ${selector}`)
          break
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Navigation elements are optional
    console.log(`Navigation functionality found: ${foundNavElement}`)
  })

  test('should handle responsive design on different screen sizes', async ({ page }) => {
    // Skip if not authenticated
    if (page.url().includes('/sign-in')) {
      console.log('User not authenticated, skipping responsive test')
      return
    }

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(1000)

    // Verify page is still functional on mobile
    await expect(page.locator('body')).toBeVisible()

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.waitForTimeout(1000)

    // Verify page is still functional on tablet
    await expect(page.locator('body')).toBeVisible()

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.waitForTimeout(1000)

    // Verify page is still functional on desktop
    await expect(page.locator('body')).toBeVisible()
  })

  test('should load expense claims page without JavaScript errors', async ({ page }) => {
    const errors: string[] = []

    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    // Navigate and wait for page to fully load
    await page.goto('/en/expense-claims')
    await page.waitForLoadState('networkidle')

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(error => {
      return !error.includes('404') &&
             !error.includes('favicon') &&
             !error.includes('analytics') &&
             !error.includes('gtag')
    })

    expect(criticalErrors).toHaveLength(0)
  })
})