/**
 * UAT Test Suite: Manager User Role
 * Tests: Manager Approvals, Authorization (EC-011)
 */
import { test, expect } from '@playwright/test';

const TEST_USERS = {
  manager: {
    email: process.env.TEST_MANAGER_EMAIL || 'test-manager@example.com',
    password: process.env.TEST_MANAGER_PASSWORD || 'test-password',
  },
};

test.describe('Test Scenario 2: Manager User', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/sign-in');
    await page.fill('input[name="email"]', TEST_USERS.manager.email);
    await page.fill('input[name="password"]', TEST_USERS.manager.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/expense-claims');
  });

  test.describe('2.1 Authentication & Navigation', () => {
    test('should show manager-specific pages in sidebar', async ({ page }) => {
      // Expected visible items
      await expect(page.locator('text=Expense Claims')).toBeVisible();
      await expect(page.locator('text=Leave Management')).toBeVisible();
      await expect(page.locator('text=Manager Approvals')).toBeVisible();
      await expect(page.locator('text=Reporting')).toBeVisible();
      await expect(page.locator('text=Settings')).toBeVisible();

      // Expected hidden items for manager
      await expect(page.locator('text=Dashboard')).not.toBeVisible();
      await expect(page.locator('text=Invoices')).not.toBeVisible();
      await expect(page.locator('text=Transactions')).not.toBeVisible();
    });
  });

  test.describe('2.2 Manager Approvals - Core Functionality', () => {
    test('should approve an expense claim', async ({ page }) => {
      // Go to Manager Approvals
      await page.goto('/en/manager/approvals');
      
      // Should see claims from direct reports
      await expect(page.locator('[data-testid="pending-claim"]').first()).toBeVisible();
      
      // Open a submitted claim
      await page.locator('[data-testid="pending-claim"]').first().click();
      
      // Click Approve
      await page.click('text=Approve');
      
      // Verify status changes
      await expect(page.locator('text=Approved')).toBeVisible();
      await expect(page.locator('text=Approved by')).toContainText(/manager/i);
      
      // Claim should disappear from pending list
      await page.goto('/en/manager/approvals');
      const claimCount = await page.locator('[data-testid="pending-claim"]').count();
      // Previous claim should no longer be in pending list
    });

    test('should reject an expense claim with reason', async ({ page }) => {
      await page.goto('/en/manager/approvals');
      
      // Open a submitted claim
      await page.locator('[data-testid="pending-claim"]').first().click();
      
      // Click Reject
      await page.click('text=Reject');
      
      // Add rejection reason
      await page.fill('textarea[name="reviewerNotes"]', 'Missing receipt attachment');
      await page.click('text=Confirm Rejection');
      
      // Verify status changes
      await expect(page.locator('text=Rejected')).toBeVisible();
      await expect(page.locator('text=Missing receipt attachment')).toBeVisible();
    });
  });

  test.describe('2.3 Manager - Expense Claims (View Only) - EC-011 AUTHORIZATION TEST', () => {
    test('CRITICAL: should NOT allow editing employee claims', async ({ page }) => {
      // Go to Expense Claims → Overview
      await page.goto('/en/expense-claims');
      
      // Should see claims from direct reports
      await expect(page.locator('[data-testid="expense-claim-row"]').first()).toBeVisible();
      
      // Click on an employee's claim
      await page.locator('[data-testid="expense-claim-row"]').first().click();
      
      // Try to edit the business purpose field
      await page.fill('input[name="businessPurpose"]', 'Manager trying to edit');
      
      // Click Save
      await page.click('text=Save Changes');
      
      // Expected: Authorization error
      await expect(page.locator('text=Not authorized to update this claim')).toBeVisible();
      await expect(page.locator('text=only the claim owner can edit')).toBeVisible();
    });
  });

  test.describe('2.4 Manager - Settings Unsaved Changes', () => {
    test('should warn when navigating away with unsaved changes', async ({ page }) => {
      await page.goto('/en/settings');
      
      // Change timezone
      await page.selectOption('select[name="timezone"]', 'America/New_York');
      
      // Try to navigate away
      await page.click('text=Expense Claims');
      
      // Expected:Confirmation dialog
      page.on('dialog', async dialog => {
        expect(dialog.message()).toContain('unsaved changes');
        await dialog.accept(); // Click OK to leave
      });
    });
  });
});
