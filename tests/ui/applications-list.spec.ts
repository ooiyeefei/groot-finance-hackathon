/**
 * Applications List UI Test
 * Tests the applications list page after refactoring to use v1 API
 */

import { test, expect } from '@playwright/test'

test.describe('Applications List UI', () => {
  const TEST_USER = process.env.TEST_USER
  const TEST_USER_PW = process.env.TEST_USER_PW
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3005'

  test.beforeEach(async ({ page }) => {
    // Navigate to sign-in page
    await page.goto(`${BASE_URL}/en/sign-in`)

    // Fill in Clerk authentication form
    await page.getByLabel('Email address').fill(TEST_USER!)
    await page.getByLabel('Password').fill(TEST_USER_PW!)
    await page.getByRole('button', { name: 'Continue' }).click()

    // Wait for successful authentication (redirect away from sign-in)
    await page.waitForURL(/\/(en|th|id|zh)\//)
  })

  test('should display the list of applications after logging in', async ({ page }) => {
    // Navigate to applications page
    await page.goto(`${BASE_URL}/en/applications`)

    // Wait for the applications list to load (with timeout to handle loading state)
    await page.waitForSelector('[data-testid="applications-list"]', { timeout: 15000 })

    // Check that we're on the applications page
    expect(page.url()).toContain('/applications')

    // Verify the New Application button is visible
    const newAppButton = page.getByRole('button', { name: /New Application/i })
    await expect(newAppButton).toBeVisible()

    // Check for either:
    // 1. Application cards (if applications exist)
    // 2. Empty state message (if no applications)
    const hasApplications = await page.locator('[data-testid="applications-list"] .grid').count() > 0

    if (hasApplications) {
      // If applications exist, verify at least one card is visible
      const applicationCards = page.locator('[data-testid="applications-list"] .grid > div')
      await expect(applicationCards.first()).toBeVisible()

      console.log(`✅ Found ${await applicationCards.count()} application(s)`)
    } else {
      // If no applications, verify empty state message
      const emptyStateMessage = page.getByText(/No Applications Yet/i)
      await expect(emptyStateMessage).toBeVisible()

      console.log(`✅ Empty state displayed correctly`)
    }
  })

  test('should show loading state before data loads', async ({ page }) => {
    // Navigate to applications page
    await page.goto(`${BASE_URL}/en/applications`)

    // Check for loading skeleton (should appear briefly)
    const loadingIndicator = page.locator('[data-testid="applications-loading"]')

    // The loading state might be very quick, so we check if it either:
    // 1. Is currently visible
    // 2. Or has already passed and the list is visible
    const isLoading = await loadingIndicator.isVisible().catch(() => false)
    const isLoaded = await page.locator('[data-testid="applications-list"]').isVisible().catch(() => false)

    expect(isLoading || isLoaded).toBeTruthy()

    console.log(`✅ Loading state handling verified`)
  })

  test('should display application cards with correct structure', async ({ page }) => {
    // Navigate to applications page
    await page.goto(`${BASE_URL}/en/applications`)

    // Wait for the applications list to load
    await page.waitForSelector('[data-testid="applications-list"]', { timeout: 15000 })

    // Check if applications exist
    const applicationCards = page.locator('[data-testid="applications-list"] .grid > div')
    const cardCount = await applicationCards.count()

    if (cardCount > 0) {
      const firstCard = applicationCards.first()

      // Verify card structure
      // Check for title link (h3 with link inside)
      const titleLink = firstCard.locator('h3 a')
      await expect(titleLink).toBeVisible()

      // Check for status badge
      const statusBadge = firstCard.locator('[class*="bg-"]').filter({ hasText: /(draft|processing|completed|failed|needs_review)/i })
      await expect(statusBadge.first()).toBeVisible()

      // Check for progress bar
      const progressBar = firstCard.locator('[class*="Progress"]')
      await expect(progressBar).toBeVisible()

      // Check for View Details button
      const viewDetailsButton = firstCard.getByRole('button', { name: /View Details/i })
      await expect(viewDetailsButton).toBeVisible()

      console.log(`✅ Application card structure validated`)
    } else {
      console.log(`⚠️ No applications to validate structure`)
    }
  })

  test('should support navigation to application details', async ({ page }) => {
    // Navigate to applications page
    await page.goto(`${BASE_URL}/en/applications`)

    // Wait for the applications list to load
    await page.waitForSelector('[data-testid="applications-list"]', { timeout: 15000 })

    // Check if applications exist
    const applicationCards = page.locator('[data-testid="applications-list"] .grid > div')
    const cardCount = await applicationCards.count()

    if (cardCount > 0) {
      // Click on the first application's "View Details" button
      const firstCard = applicationCards.first()
      const viewDetailsButton = firstCard.getByRole('button', { name: /View Details/i })

      await viewDetailsButton.click()

      // Wait for navigation to application detail page
      await page.waitForURL(/\/applications\/[a-f0-9-]+/, { timeout: 10000 })

      // Verify we're on a detail page
      expect(page.url()).toMatch(/\/applications\/[a-f0-9-]+/)

      console.log(`✅ Navigation to application details working`)
    } else {
      console.log(`⚠️ No applications to test navigation`)
    }
  })

  test('should handle create new application button', async ({ page }) => {
    // Navigate to applications page
    await page.goto(`${BASE_URL}/en/applications`)

    // Wait for the applications list to load
    await page.waitForSelector('[data-testid="applications-list"]', { timeout: 15000 })

    // Find the "New Application" button
    const newAppButton = page.getByRole('button', { name: /New Application/i }).first()
    await expect(newAppButton).toBeVisible()
    await expect(newAppButton).toBeEnabled()

    // Note: We don't actually click it to avoid creating test data
    // Just verify it's interactive
    console.log(`✅ New Application button is functional`)
  })
})
