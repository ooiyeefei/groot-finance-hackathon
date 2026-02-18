/**
 * UAT Test Suite: Employee User Role
 * Tests: EC-010, EC-011 fixes and core functionality
 */
import { test, expect } from '@playwright/test';

// Test credentials would be loaded from environment variables
const TEST_USERS = {
  employee: {
    email: process.env.TEST_EMPLOYEE_EMAIL || 'test-employee@example.com',
    password: process.env.TEST_EMPLOYEE_PASSWORD || 'test-password',
  },
};

test.describe('Test Scenario 1: Employee User', () => {
  test.beforeEach(async ({ page }) => {
    // Login as employee
    await page.goto('/en/sign-in');
    await page.fill('input[name="email"]', TEST_USERS.employee.email);
    await page.fill('input[name="password"]', TEST_USERS.employee.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/expense-claims');
  });

  test.describe('1.1 Authentication & Navigation', () => {
    test('should show only accessible pages in sidebar', async ({ page }) => {
      // Expected visible items
      await expect(page.locator('text=Expense Claims')).toBeVisible();
      await expect(page.locator('text=Leave Management')).toBeVisible();
      await expect(page.locator('text=Reporting')).toBeVisible();
      await expect(page.locator('text=Settings')).toBeVisible();

      // Expected hidden items for employee
      await expect(page.locator('text=Dashboard')).not.toBeVisible();
      await expect(page.locator('text=Invoices')).not.toBeVisible();
      await expect(page.locator('text=Transactions')).not.toBeVisible();
      await expect(page.locator('text=Manager Approvals')).not.toBeVisible();
    });
  });

  test.describe('1.2 Expense Claims - CRUD Flow', () => {
    test('should create, edit, and submit an expense claim', async ({ page }) => {
      // Navigate to expense claims
      await page.goto('/en/expense-claims');
      
      // Click create new claim
      await page.click('text=Create New Claim');
      
      // Fill in details
      await page.fill('input[name="businessPurpose"]', 'Business Lunch with Client');
      await page.fill('input[name="vendorName"]', 'Restaurant ABC');
      await page.fill('input[name="totalAmount"]', '150.00');
      await page.selectOption('select[name="expenseCategory"]', 'Meals & Entertainment');
      
      // Save as draft
      await page.click('text=Save as Draft');
      
      // Verify draft appears in overview
      await expect(page.locator('text=Draft')).toBeVisible();
      await expect(page.locator('text=Business Lunch with Client')).toBeVisible();
      
      // Open the draft
      await page.click('text=Business Lunch with Client');
      
      // Edit the business purpose
      await page.fill('input[name="businessPurpose"]', 'Updated: Client Meeting Lunch');
      await page.click('text=Save Changes');
      
      // Verify updates
      await expect(page.locator('text=Updated: Client Meeting Lunch')).toBeVisible();
      
      // Submit for approval
      await page.click('text=Submit for Approval');
      
      // Verify status changes to submitted
      await expect(page.locator('text=Submitted')).toBeVisible();
      
      // Check History tab
      await page.click('text=History');
      await expect(page.locator('text=Submitted for approval')).toBeVisible();
    });
  });

  test.describe('1.3 Expense Claims - Authorization Check', () => {
    test('should deny access to other users claims', async ({ page }) => {
      // Try to access a claim URL with a different ID
      await page.goto('/en/expense-claims/some-other-user-claim-id');
      
      // Should show access denied or 404
      const errorText = await page.locator('body').textContent();
      expect(errorText?.toLowerCase()).toMatch(/access denied|not found|404|unauthorized/);
    });
  });

  test.describe('1.4 Settings - Unsaved Changes Warning (EC-010 FIX)', () => {
    test('should warn when navigating away with unsaved changes', async ({ page }) => {
      // Go to Settings → Profile
      await page.goto('/en/settings');
      
      // Change preferred currency
      await page.selectOption('select[name="preferredCurrency"]', 'USD');
      
      // Try to navigate away without saving
      await page.click('text=Expense Claims');
      
      // Expected: Confirmation dialog appears
      page.on('dialog', async dialog => {
        expect(dialog.message()).toContain('unsaved changes');
        await dialog.dismiss(); // Click Cancel
      });
      
      // Should stay on settings page
      await expect(page).toHaveURL(/.*settings.*/);
      
      // Now save the change
      await page.click('text=Save');
      
      // Navigate again - should work without warning
      await page.click('text=Expense Claims');
      await expect(page).toHaveURL(/.*expense-claims.*/);
    });
  });

  test.describe('1.5 Leave Management', () => {
    test('should submit leave request and appear on team calendar', async ({ page }) => {
      // Go to Leave Management
      await page.goto('/en/leave-management');
      
      // Submit a leave request
      await page.click('text=Request Leave');
      await page.fill('input[name="startDate"]', '2026-03-01');
      await page.fill('input[name="endDate"]', '2026-03-03');
      await page.selectOption('select[name="leaveType"]', 'Annual Leave');
      await page.click('text=Submit Request');
      
      // Go to Team Calendar tab
      await page.click('text=Team Calendar');
      
      // Verify leave appears on calendar
      await expect(page.locator('text=Annual Leave')).toBeVisible();
    });
  });

  test.describe('1.6 Reporting', () => {
    test('should export expenses to CSV', async ({ page }) => {
      await page.goto('/en/reporting');
      
      // Click export
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('text=Export to CSV'),
      ]);
      
      // Verify download
      expect(download.suggestedFilename()).toContain('.csv');
    });
  });

  test.describe('1.7 Concurrent Edit Detection (EC-011)', () => {
    test('should detect concurrent edits from same user', async ({ page, context }) => {
      // Create a draft claim first
      await page.goto('/en/expense-claims');
      await page.click('text=Create New Claim');
      await page.fill('input[name="businessPurpose"]', 'Concurrent Edit Test');
      await page.click('text=Save as Draft');
      
      // Get the claim URL
      const claimUrl = page.url();
      
      // Open second tab with same claim
      const page2 = await context.newPage();
      await page2.goto(claimUrl);
      
      // Tab 1: Make changes and save
      await page.fill('input[name="businessPurpose"]', 'Changed from Tab 1');
      await page.click('text=Save Changes');
      
      // Tab 2: Try to make different changes
      await page2.fill('input[name="businessPurpose"]', 'Changed from Tab 2');
      await page2.click('text=Save Changes');
      
      // Expected: Error about concurrent edit
      await expect(page2.locator('text=CONCURRENT_EDIT')).toBeVisible();
      await expect(page2.locator('text=modified by another user')).toBeVisible();
    });
  });
});
