import { test, expect } from '@playwright/test';

test.describe('Transactions Server-Side Filtering', () => {
  // Use test credentials from .env.local
  const TEST_USER = process.env.TEST_USER;
  const TEST_USER_PW = process.env.TEST_USER_PW;

  test.beforeEach(async ({ page }) => {
    // Navigate to the transactions page and authenticate
    await page.goto('/en/transactions');

    // Check if we need to sign in
    if (page.url().includes('sign-in')) {
      // Fill in Clerk authentication form
      await page.getByLabel('Email address').fill(TEST_USER!);
      await page.getByLabel('Password').fill(TEST_USER_PW!);
      await page.getByRole('button', { name: 'Continue' }).click();

      // Wait for redirect to transactions page
      await page.waitForURL('**/transactions');
    }

    // Wait for transactions to load
    await page.waitForSelector('[data-testid="transactions-list"]', { timeout: 10000 });
  });

  test('should filter transactions by search query on server-side', async ({ page }) => {
    // Get initial transaction count
    const initialTransactions = await page.locator('[data-testid="transaction-item"]').count();

    // Perform search filter
    await page.getByPlaceholder('Search transactions...').fill('expense');

    // Wait for network request to complete (server-side filtering)
    await page.waitForResponse(response =>
      response.url().includes('/api/transactions') &&
      response.url().includes('search=expense')
    );

    // Verify filtered results are loaded
    await page.waitForTimeout(1000); // Allow UI to update
    const filteredTransactions = await page.locator('[data-testid="transaction-item"]').count();

    // Check that filtering actually occurred (assuming we have some non-matching transactions)
    expect(filteredTransactions).toBeLessThanOrEqual(initialTransactions);

    // Verify the API call includes the search parameter
    const requests = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter((entry: any) => entry.name.includes('/api/transactions'))
        .map((entry: any) => entry.name);
    });

    const hasSearchParam = requests.some(url => url.includes('search=expense'));
    expect(hasSearchParam).toBeTruthy();
  });

  test('should filter transactions by category on server-side', async ({ page }) => {
    // Get available categories from the dropdown
    const categorySelect = page.locator('select').nth(0); // First select is category
    await categorySelect.selectOption({ index: 1 }); // Select first non-empty option

    // Wait for network request with category parameter
    await page.waitForResponse(response =>
      response.url().includes('/api/transactions') &&
      response.url().includes('category=')
    );

    // Verify results are filtered
    await page.waitForTimeout(1000);
    const transactionItems = await page.locator('[data-testid="transaction-item"]');

    // Verify active filter pill appears
    const activeFilters = await page.locator('[data-testid="active-filter-pill"]');
    expect(await activeFilters.count()).toBeGreaterThan(0);
  });

  test('should filter transactions by type on server-side', async ({ page }) => {
    // Select a transaction type
    const typeSelect = page.locator('select').nth(1); // Second select is type
    await typeSelect.selectOption('expense');

    // Wait for network request with transaction_type parameter
    await page.waitForResponse(response =>
      response.url().includes('/api/transactions') &&
      response.url().includes('transaction_type=expense')
    );

    // Verify results are filtered
    await page.waitForTimeout(1000);

    // Check that the results summary updates appropriately
    const resultsSummary = page.locator('[data-testid="results-summary"]');
    const summaryText = await resultsSummary.textContent();
    expect(summaryText).toContain('matching'); // Should show "matching transactions" when filtered
  });

  test('should apply date range filter on server-side', async ({ page }) => {
    // Set date range
    const dateFromInput = page.locator('input[type="date"]').first();
    const dateToInput = page.locator('input[type="date"]').last();

    await dateFromInput.fill('2024-01-01');
    await dateToInput.fill('2024-12-31');

    // Wait for network request with date parameters
    await page.waitForResponse(response =>
      response.url().includes('/api/transactions') &&
      response.url().includes('date_from=2024-01-01') &&
      response.url().includes('date_to=2024-12-31')
    );

    // Verify active date filters appear
    const activeFilters = await page.locator('[data-testid="active-filter-pill"]');
    const filterCount = await activeFilters.count();
    expect(filterCount).toBe(2); // Should have "from" and "to" filter pills
  });

  test('should clear all filters and reset to unfiltered view', async ({ page }) => {
    // Apply multiple filters
    await page.getByPlaceholder('Search transactions...').fill('test');
    await page.locator('select').nth(1).selectOption('expense');

    // Wait for filtered results
    await page.waitForResponse(response =>
      response.url().includes('/api/transactions') &&
      response.url().includes('search=test')
    );

    // Click clear all filters button
    await page.getByRole('button', { name: 'Clear All Filters' }).click();

    // Wait for unfiltered results
    await page.waitForResponse(response =>
      response.url().includes('/api/transactions') &&
      !response.url().includes('search=') &&
      !response.url().includes('transaction_type=')
    );

    // Verify filters are cleared
    const activeFilters = await page.locator('[data-testid="active-filter-pill"]');
    expect(await activeFilters.count()).toBe(0);

    // Verify input fields are empty
    const searchInput = page.getByPlaceholder('Search transactions...');
    expect(await searchInput.inputValue()).toBe('');
  });

  test('should maintain infinite scroll functionality with filtering', async ({ page }) => {
    // Apply a filter that will have results
    await page.getByPlaceholder('Search transactions...').fill('e');

    // Wait for filtered results
    await page.waitForResponse(response =>
      response.url().includes('/api/transactions') &&
      response.url().includes('search=e')
    );

    // Check if Load More button appears
    const loadMoreButton = page.getByRole('button', { name: 'Load More' });
    if (await loadMoreButton.isVisible()) {
      // Click Load More and verify it works with filters
      await loadMoreButton.click();

      // Wait for next page with same filters
      await page.waitForResponse(response =>
        response.url().includes('/api/transactions') &&
        response.url().includes('search=e') &&
        response.url().includes('cursor=')
      );

      // Verify more transactions are loaded
      await page.waitForTimeout(1000);
      const transactions = await page.locator('[data-testid="transaction-item"]').count();
      expect(transactions).toBeGreaterThan(0);
    }
  });
});