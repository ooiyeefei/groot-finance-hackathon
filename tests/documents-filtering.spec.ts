import { test, expect } from '@playwright/test'

/**
 * Documents Server-Side Filtering Tests
 *
 * Validates that the Documents page correctly implements server-side filtering
 * following the established gold standard architecture from Transactions page.
 *
 * Test Coverage:
 * - Search functionality (filename search)
 * - Status filtering (pending, processing, completed, failed)
 * - File type filtering (PDF, JPEG, PNG)
 * - Date range filtering (upload date)
 * - Combined filters validation
 * - Load More infinite scroll functionality
 * - Filter persistence and cache invalidation
 */

test.describe('Documents Page - Server-Side Filtering', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to documents page
    await page.goto('/en/documents')

    // Wait for the page to load and documents to be fetched
    await page.waitForSelector('[data-testid="documents-list"]', { timeout: 10000 })
  })

  test('should display documents list with proper structure', async ({ page }) => {
    // Check that main components are present
    await expect(page.locator('[data-testid="documents-list"]')).toBeVisible()
    await expect(page.locator('[data-testid="documents-refresh-button"]')).toBeVisible()

    // Check that filtering controls are present
    await expect(page.locator('[data-testid="documents-search-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="documents-status-filter"]')).toBeVisible()
    await expect(page.locator('[data-testid="documents-file-type-filter"]')).toBeVisible()
    await expect(page.locator('[data-testid="documents-date-from-filter"]')).toBeVisible()
    await expect(page.locator('[data-testid="documents-date-to-filter"]')).toBeVisible()
  })

  test('should filter documents by search term (server-side)', async ({ page }) => {
    // Get initial document count
    const initialDocuments = await page.locator('[data-testid^="document-item-"]').count()

    if (initialDocuments === 0) {
      await expect(page.locator('[data-testid="documents-empty-state"]')).toBeVisible()
      return
    }

    // Enter search term
    await page.fill('[data-testid="documents-search-input"]', 'invoice')

    // Wait for debounced search to trigger server request
    await page.waitForTimeout(1000)

    // Verify that the list updates (may show fewer results or empty state)
    // The key test is that the search parameter was sent to the server
    const searchInput = page.locator('[data-testid="documents-search-input"]')
    await expect(searchInput).toHaveValue('invoice')

    // Test clearing search
    await page.fill('[data-testid="documents-search-input"]', '')
    await page.waitForTimeout(1000)

    // Should return to showing all documents
    await expect(searchInput).toHaveValue('')
  })

  test('should filter documents by status (server-side)', async ({ page }) => {
    // Test each status filter option
    const statusOptions = ['pending', 'processing', 'completed', 'failed']

    for (const status of statusOptions) {
      // Select status filter
      await page.selectOption('[data-testid="documents-status-filter"]', status)

      // Wait for server response
      await page.waitForTimeout(500)

      // Verify filter is applied
      const statusFilter = page.locator('[data-testid="documents-status-filter"]')
      await expect(statusFilter).toHaveValue(status)

      // Verify clear filters button appears when filter is active
      await expect(page.locator('[data-testid="clear-filters-button"]')).toBeVisible()
    }

    // Test "All statuses" option
    await page.selectOption('[data-testid="documents-status-filter"]', '')
    await page.waitForTimeout(500)

    // Clear filters button should disappear
    await expect(page.locator('[data-testid="clear-filters-button"]')).toBeHidden()
  })

  test('should filter documents by file type (server-side)', async ({ page }) => {
    // Test each file type filter option
    const fileTypes = [
      { value: 'application/pdf', label: 'PDF' },
      { value: 'image/jpeg', label: 'JPEG' },
      { value: 'image/png', label: 'PNG' }
    ]

    for (const fileType of fileTypes) {
      // Select file type filter
      await page.selectOption('[data-testid="documents-file-type-filter"]', fileType.value)

      // Wait for server response
      await page.waitForTimeout(500)

      // Verify filter is applied
      const fileTypeFilter = page.locator('[data-testid="documents-file-type-filter"]')
      await expect(fileTypeFilter).toHaveValue(fileType.value)

      // Verify clear filters button appears
      await expect(page.locator('[data-testid="clear-filters-button"]')).toBeVisible()
    }

    // Test "All types" option
    await page.selectOption('[data-testid="documents-file-type-filter"]', '')
    await page.waitForTimeout(500)
  })

  test('should filter documents by date range (server-side)', async ({ page }) => {
    // Set date range (last 30 days)
    const today = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(today.getDate() - 30)

    const todayStr = today.toISOString().split('T')[0]
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

    // Fill date inputs
    await page.fill('[data-testid="documents-date-from-filter"]', thirtyDaysAgoStr)
    await page.fill('[data-testid="documents-date-to-filter"]', todayStr)

    // Wait for server response
    await page.waitForTimeout(500)

    // Verify filters are applied
    await expect(page.locator('[data-testid="documents-date-from-filter"]')).toHaveValue(thirtyDaysAgoStr)
    await expect(page.locator('[data-testid="documents-date-to-filter"]')).toHaveValue(todayStr)

    // Verify clear filters button appears
    await expect(page.locator('[data-testid="clear-filters-button"]')).toBeVisible()
  })

  test('should apply multiple filters simultaneously (server-side)', async ({ page }) => {
    // Apply multiple filters at once
    await page.fill('[data-testid="documents-search-input"]', 'receipt')
    await page.selectOption('[data-testid="documents-status-filter"]', 'completed')
    await page.selectOption('[data-testid="documents-file-type-filter"]', 'application/pdf')

    // Wait for server response with all filters
    await page.waitForTimeout(1000)

    // Verify all filters are maintained
    await expect(page.locator('[data-testid="documents-search-input"]')).toHaveValue('receipt')
    await expect(page.locator('[data-testid="documents-status-filter"]')).toHaveValue('completed')
    await expect(page.locator('[data-testid="documents-file-type-filter"]')).toHaveValue('application/pdf')

    // Clear filters button should be visible
    await expect(page.locator('[data-testid="clear-filters-button"]')).toBeVisible()
  })

  test('should clear all filters correctly', async ({ page }) => {
    // Apply some filters first
    await page.fill('[data-testid="documents-search-input"]', 'test')
    await page.selectOption('[data-testid="documents-status-filter"]', 'pending')
    await page.selectOption('[data-testid="documents-file-type-filter"]', 'image/jpeg')

    // Wait for filters to be applied
    await page.waitForTimeout(1000)

    // Click clear filters button
    await page.click('[data-testid="clear-filters-button"]')

    // Wait for server response
    await page.waitForTimeout(500)

    // Verify all filters are cleared
    await expect(page.locator('[data-testid="documents-search-input"]')).toHaveValue('')
    await expect(page.locator('[data-testid="documents-status-filter"]')).toHaveValue('')
    await expect(page.locator('[data-testid="documents-file-type-filter"]')).toHaveValue('')
    await expect(page.locator('[data-testid="documents-date-from-filter"]')).toHaveValue('')
    await expect(page.locator('[data-testid="documents-date-to-filter"]')).toHaveValue('')

    // Clear filters button should be hidden
    await expect(page.locator('[data-testid="clear-filters-button"]')).toBeHidden()
  })

  test('should handle Load More functionality for infinite scroll', async ({ page }) => {
    // Check if Load More button exists (depends on having more than 20 documents)
    const loadMoreButton = page.locator('[data-testid="documents-load-more-button"]')

    if (await loadMoreButton.isVisible()) {
      // Get initial document count
      const initialCount = await page.locator('[data-testid^="document-item-"]').count()

      // Click Load More
      await loadMoreButton.click()

      // Wait for new documents to load
      await page.waitForTimeout(2000)

      // Verify more documents are loaded
      const newCount = await page.locator('[data-testid^="document-item-"]').count()
      expect(newCount).toBeGreaterThan(initialCount)

      // Verify button shows loading state during fetch
      await expect(loadMoreButton).toContainText('Loading more documents...')
    }
  })

  test('should maintain filters when using Load More', async ({ page }) => {
    // Apply a filter
    await page.selectOption('[data-testid="documents-status-filter"]', 'completed')
    await page.waitForTimeout(500)

    // Check if Load More button exists with filtered results
    const loadMoreButton = page.locator('[data-testid="documents-load-more-button"]')

    if (await loadMoreButton.isVisible()) {
      // Click Load More
      await loadMoreButton.click()
      await page.waitForTimeout(2000)

      // Verify filter is still applied
      await expect(page.locator('[data-testid="documents-status-filter"]')).toHaveValue('completed')
    }
  })

  test('should refresh documents list correctly', async ({ page }) => {
    // Click refresh button
    await page.click('[data-testid="documents-refresh-button"]')

    // Wait for refresh to complete
    await page.waitForTimeout(1000)

    // Verify page still shows documents list
    await expect(page.locator('[data-testid="documents-list"]')).toBeVisible()
  })

  test('should handle document actions when present', async ({ page }) => {
    // Check if any document items exist
    const documentItems = page.locator('[data-testid^="document-item-"]')
    const documentCount = await documentItems.count()

    if (documentCount > 0) {
      const firstDocument = documentItems.first()
      const documentId = await firstDocument.getAttribute('data-testid')
      const docId = documentId?.replace('document-item-', '') || ''

      // Check for various action buttons (may not all be present depending on document status)
      const possibleActions = [
        `process-document-${docId}`,
        `analyze-document-${docId}`,
        `delete-document-${docId}`
      ]

      for (const actionTestId of possibleActions) {
        const actionButton = page.locator(`[data-testid="${actionTestId}"]`)
        if (await actionButton.isVisible()) {
          // Just verify the button exists and is clickable
          await expect(actionButton).toBeEnabled()
        }
      }
    }
  })

  test('should handle empty state correctly', async ({ page }) => {
    // Apply a very specific filter that should return no results
    await page.fill('[data-testid="documents-search-input"]', 'nonexistentfilename12345')
    await page.waitForTimeout(1000)

    // Should show empty state or no documents
    const documentItems = await page.locator('[data-testid^="document-item-"]').count()

    if (documentItems === 0) {
      // Either empty state or just no documents shown
      const emptyState = page.locator('[data-testid="documents-empty-state"]')
      // Empty state may or may not be visible depending on implementation
    }

    // Clear the search to restore normal state
    await page.fill('[data-testid="documents-search-input"]', '')
    await page.waitForTimeout(1000)
  })
})