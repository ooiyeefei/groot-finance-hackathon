# UAT Test Cases: DSPy CUA Integration — Pre-Deployment Regression

**Target**: https://finance.hellogroot.com
**Account**: Admin (yeefei+test2@hellogroot.com)
**Purpose**: Verify existing e-invoice flow works before deploying DSPy backend changes

## Test Cases

### TC-001: Login and Dashboard Load (P1 - Critical)
1. Navigate to https://finance.hellogroot.com
2. Sign in with admin credentials
3. Verify dashboard loads with sidebar navigation
4. Expected: Dashboard page renders, sidebar visible with menu items

### TC-002: Expense Claims Page Load (P1 - Critical)
1. Navigate to Expense Claims from sidebar
2. Verify page loads with expense claims list/table
3. Expected: Expense claims page renders with data or empty state

### TC-003: E-Invoice Status Visibility (P2 - High)
1. On expense claims page, look for any claims with e-invoice status
2. Check for e-invoice status badges (requested, received, failed)
3. Expected: E-invoice status indicators visible on applicable claims

### TC-004: Notification Bell (P2 - High)
1. Click the notification bell icon in the header
2. Verify notification panel opens
3. Check for any existing notifications
4. Expected: Notification panel opens and displays notifications or empty state

### TC-005: Business Settings / Admin Pages (P2 - High)
1. Navigate to Settings or Admin section from sidebar
2. Look for any e-invoice configuration options (LHDN settings, merchant config)
3. Expected: Settings page loads, any e-invoice config sections are accessible

### TC-006: Expense Claim Detail View (P2 - High)
1. Click on any existing expense claim to view details
2. Check for e-invoice request section or status
3. Expected: Claim detail modal/page loads with all fields visible

### TC-007: Navigate Core Pages (P3 - Medium)
1. Navigate to key sidebar pages: Invoices, Analytics, Accounting
2. Verify each page loads without errors
3. Expected: All core pages render correctly
