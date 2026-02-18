/**
 * UAT Test Suite: Finance Admin User Role
 * Tests: Full access, Authorization (EC-011), Dashboard, Invoices
 */
import { test, expect } from '@playwright/test';

const TEST_USERS = {
  financeAdmin: {
    email: process.env.TEST_FINANCE_ADMIN_EMAIL || 'test-finance-admin@example.com',
    password: process.env.TEST_FINANCE_ADMIN_PASSWORD || 'test-password',
  },
};

test.describe('Test Scenario 3: Finance Admin User', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/sign-in');
    await page.fill('input[name="email"]', TEST_USERS.financeAdmin.email);
    await page.fill('input[name="password"]', TEST_USERS.financeAdmin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
  });

  test.describe('3.1 Authentication & Navigation', () => {
    test('should show ALL pages in sidebar', async ({ page }) => {
      // Should see ALL navigation items
      await expect(page.locator('text=Dashboard')).toBeVisible();
      await expect(page.locator('text=Invoices')).toBeVisible();
      await expect(page.locator('text=Transactions')).toBeVisible();
      await expect(page.locator('text=Expense Claims')).toBeVisible();
      await expect(page.locator('text=Leave Management')).toBeVisible();
      await expect(page.locator('text=Manager Approvals')).toBeVisible();
      await expect(page.locator('text=Reporting')).toBeVisible();
      await expect(page.locator('text=Settings')).toBeVisible();
    });
  });

  test.describe('3.2 Dashboard', () => {
    test('should load financial analytics', async ({ page }) => {
      await page.goto('/en/dashboard');
      
      // Verify charts load
      await expect(page.locator('[data-testid="analytics-chart"]')).toBeVisible();
      await expect(page.locator('[data-testid="metrics-cards"]')).toBeVisible();
      
      // Check metrics display
      await expect(page.locator('text=Total Revenue|Total Expenses|Net Profit')).toBeVisible();
    });
  });

  test.describe('3.3 Invoices - AR Dashboard', () => {
    test('should display AR Dashboard sections', async ({ page }) => {
      await page.goto('/en/sales-invoices');
      
      // Overview metrics
      await expect(page.locator('text=Total Outstanding')).toBeVisible();
      await expect(page.locator('text=Overdue Amount')).toBeVisible();
      
      // Switch tabs
      await page.click('text=Sales Invoices');
      await expect(page.locator('[data-testid="invoice-list"]')).toBeVisible();
      
      await page.click('text=Debtors');
      await expect(page.locator('text=Aging Report')).toBeVisible();
      
      await page.click('text=Product Catalog');
      await expect(page.locator('[data-testid="catalog-items"]')).toBeVisible();
    });
  });

  test.describe('3.4 Invoices - AP Dashboard', () => {
    test('should display AP Dashboard sections', async ({ page }) => {
      await page.goto('/en/payables');
      
      // Overview metrics
      await expect(page.locator('text=Payables Overview')).toBeVisible();
      
      // Switch tabs
      await page.click('text=Incoming Invoices');
      await expect(page.locator('[data-testid="ap-invoice-list"]')).toBeVisible();
      
      await page.click('text=Vendors');
      await expect(page.locator('[data-testid="vendor-list"]')).toBeVisible();
      
      await page.click('text=Price Intelligence');
      await expect(page.locator('text=Price Comparison')).toBeVisible();
    });
  });

  test.describe('3.5 Transactions', () => {
    test('should load accounting entries and filter by date', async ({ page }) => {
      await page.goto('/en/accounting');
      
      // Verify entries load
      await expect(page.locator('[data-testid="accounting-entries"]')).toBeVisible();
      
      // Test date filtering
      await page.fill('input[name="startDate"]', '2026-01-01');
      await page.fill('input[name="endDate"]', '2026-12-31');
      await page.click('text=Apply Filter');
      
      // Check filtered results
      await expect(page.locator('[data-testid="accounting-entries"]')).toBeVisible();
    });
  });

  test.describe('3.6 Expense Claims - Authorization Check (EC-011 FIX)', () => {
    test('CRITICAL: Finance Admin should NOT be able to edit employee claims', async ({ page }) => {
      await page.goto('/en/expense-claims');
      
      // Find an employee claim (not submitted by admin)
      const employeeClaims = page.locator('[data-testid="employee-claim"]');
      await expect(employeeClaims.first()).toBeVisible();
      
      // Click to view
      await employeeClaims.first().click();
      
      // Try to edit
      await page.fill('input[name="businessPurpose"]', 'Admin trying to edit employee claim');
      await page.fill('input[name="totalAmount"]', '999.99');
      
      // Click Save
      await page.click('text=Save Changes');
      
      // Expected: Authorization error
      await expect(page.locator('text=Not authorized to update this claim')).toBeVisible();
      await expect(page.locator('text=only the claim owner can edit')).toBeVisible();
    });
  });

  test.describe('3.7 Expense Claims - Approval Works', () => {
    test('admin CAN approve/reject claims despite not being able to edit', async ({ page }) => {
      await page.goto('/en/expense-claims');
      
      // Open a submitted claim
      const submittedClaims = page.locator('[data-testid="submitted-claim"]');
      await expect(submittedClaims.first()).toBeVisible();
      await submittedClaims.first().click();
      
      // Should be able to approve
      await page.click('text=Approve');
      
      // Success - claim status changes
      await expect(page.locator('text=Approved')).toBeVisible();
    });
  });

  test.describe('3.8 Settings - All Tabs Access', () => {
    test('should access all settings tabs', async ({ page }) => {
      await page.goto('/en/settings');
      
      // Verify all tabs are accessible
      const tabs = ['Business', 'Categories', 'Leave', 'Team', 'API Keys', 'Billing', 'Integrations', 'Profile'];
      
      for (const tab of tabs) {
        await page.click(`text=${tab}`);
        await expect(page.locator(`[data-testid="${tab.toLowerCase()}-settings"]`)).toBeVisible();
      }
    });
  });

  test.describe('3.9 Settings - Unsaved Changes (EC-010 FIX)', () => {
    test('should warn when navigating tabs with unsaved changes', async ({ page }) => {
      await page.goto('/en/settings');
      
      // Go to Business tab
      await page.click('text=Business');
      
      // Change business name
      await page.fill('input[name="businessName"]', 'New Business Name');
      
      // Try to navigate to Categories without saving
      await page.click('text=Categories');
      
      // Expected: Warning dialog
      page.on('dialog', async dialog => {
        expect(dialog.message()).toContain('unsaved changes');
        await dialog.dismiss(); // Cancel
      });
      
      // Should stay on Business tab
      await expect(page).toHaveURL(/.*settings.*/);
      
      // Save the change
      await page.click('text=Save');
      
      // Now navigate - should work
      await page.click('text=Categories');
      await expect(page).toHaveURL(/.*settings.*/);
    });
  });
});
