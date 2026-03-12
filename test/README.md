# AR Reconciliation - Test Data

Test files for AR Reconciliation (Issue #271) feature.

## Test Files

### `ar-recon-test-data.csv`
Sample sales statement CSV for testing the AR reconciliation matching engine.

**Contents**: 4 orders that match existing sales invoices in the test account
- INV-2026-042 (test yf, S$79.00)
- INV-2026-040 (Folk Dreams Marketing Sdn Bhd, RM2,880.00)
- INV-2026-038 (test, RM79.00)
- INV-2026-039 (test yf, S$15.00)

**Expected Result**:
- All 4 orders should auto-match via `exact_reference` method
- Dashboard should show: Matched: 4, Gross Total updated, Platform Fees calculated correctly

## How to Use

1. Go to `https://finance.hellogroot.com/en/invoices#ar-reconciliation`
2. Click "Import Sales Statement"
3. Upload `ar-recon-test-data.csv`
4. System should auto-detect all 16 columns
5. Preview and import
6. Verify matching results

## Test Scenarios

### Scenario 1: Exact Reference Matching ✅
- **Input**: Orders with order references matching invoice numbers
- **Expected**: Auto-match with method `exact_reference`
- **Status**: Tested and passed in production UAT (2026-03-12)

### Scenario 2: CSV Import Workflow ✅
- **Input**: CSV file with 16 columns (Order Reference, Date, Customer, Product, etc.)
- **Expected**: Auto-detection, column mapping, preview, successful import
- **Status**: Tested and passed in production UAT (2026-03-12)

### Scenario 3: Fee Breakdown Tracking ✅
- **Input**: CSV with Commission, Shipping, Marketing, Refund fees
- **Expected**: Fees extracted and displayed in dashboard
- **Status**: Tested and passed in production UAT (2026-03-12)

## Known Issues

### Google Sheets Copy/Paste Issue
If you copy this CSV content and paste it directly into Google Sheets, it will appear in one column.

**❌ Wrong**: Copy/paste CSV text into Google Sheets cells
**✅ Correct**: Use "File > Import > Upload" in Google Sheets

The parser now includes a fallback mechanism to detect and recover from this issue.

## Notes

- Test data uses production invoice numbers that exist in the test account
- All amounts and fees are synthetic but realistic
- Customer names match actual customers in test environment
