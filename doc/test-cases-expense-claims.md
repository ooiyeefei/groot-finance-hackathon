# Expense Claims Workflow Test Cases

## Overview
These test cases validate the complete expense claims workflow from submission to reimbursement, ensuring proper accounting principles and IFRS/GAAP compliance.

## Test Environment Setup
- Test user with employee role
- Test manager with approval permissions
- Test business context with expense categories configured
- Sample receipt images (PDF/JPG) for upload testing

## Core Workflow Test Cases

### TC-001: Basic Expense Claim Submission
**Objective**: Verify user can submit expense claim with receipt upload
**Prerequisites**: User logged in with employee role

**Steps**:
1. Navigate to expense claims submission page
2. Upload receipt image (JPG/PDF)
3. Verify OCR extraction triggers (DSPy pipeline)
4. Verify extracted data populates form fields:
   - Vendor name
   - Amount and currency
   - Transaction date
   - Line items (if applicable)
5. Select expense category
6. Add optional description
7. Submit expense claim

**Expected Results**:
- Receipt uploads successfully to Supabase Storage
- OCR processing triggers via Trigger.dev background job
- `expense_claims` record created with status 'submitted'
- `processing_metadata` JSONB field contains extracted data
- `accounting_entry_id` remains NULL (no accounting entry created)
- User receives confirmation message

**Validation Queries**:
```sql
-- Verify expense claim created correctly
SELECT id, status, vendor_name, total_amount, currency, accounting_entry_id, processing_metadata
FROM expense_claims
WHERE user_id = :user_id
ORDER BY created_at DESC LIMIT 1;

-- Verify NO accounting entry exists yet
SELECT COUNT(*) FROM accounting_entries
WHERE id = (SELECT accounting_entry_id FROM expense_claims WHERE id = :claim_id);
-- Should return 0
```

### TC-002: Manager Approval Workflow
**Objective**: Verify manager can approve expense claims and accounting entries are created
**Prerequisites**: Pending expense claim from TC-001

**Steps**:
1. Login as manager
2. Navigate to approval dashboard
3. Review expense claim details
4. Verify receipt image display with OCR annotations
5. Approve expense claim
6. Verify accounting entry creation

**Expected Results**:
- Expense claim status changes to 'approved'
- `approval_date` and `approved_by_ids` updated
- RPC function `create_accounting_entry_from_approved_claim` executes
- New `accounting_entries` record created from `processing_metadata`
- `expense_claims.accounting_entry_id` linked to new accounting entry
- Line items created if present in metadata

**Validation Queries**:
```sql
-- Verify expense claim approved
SELECT status, approval_date, approved_by_ids, accounting_entry_id
FROM expense_claims
WHERE id = :claim_id;

-- Verify accounting entry created
SELECT id, description, total_amount, currency, status, transaction_date, vendor_name
FROM accounting_entries
WHERE id = (SELECT accounting_entry_id FROM expense_claims WHERE id = :claim_id);

-- Verify line items created (if applicable)
SELECT item_description, quantity, unit_price, total_amount
FROM line_items
WHERE accounting_entry_id = (SELECT accounting_entry_id FROM expense_claims WHERE id = :claim_id);
```

### TC-003: Expense Claim Rejection
**Objective**: Verify manager can reject expense claims without creating accounting entries
**Prerequisites**: Pending expense claim

**Steps**:
1. Login as manager
2. Navigate to approval dashboard
3. Review expense claim
4. Reject expense claim with reason
5. Verify no accounting entry created

**Expected Results**:
- Expense claim status changes to 'rejected'
- `accounting_entry_id` remains NULL
- No accounting entry created
- User notified of rejection

**Validation Queries**:
```sql
-- Verify rejection
SELECT status, accounting_entry_id FROM expense_claims WHERE id = :claim_id;
-- accounting_entry_id should be NULL

-- Verify no accounting entry exists
SELECT COUNT(*) FROM accounting_entries WHERE id = :any_id_that_shouldnt_exist;
```

### TC-004: Reimbursement Processing
**Objective**: Verify reimbursement updates accounting entry status
**Prerequisites**: Approved expense claim with accounting entry

**Steps**:
1. Login as finance user/manager
2. Navigate to reimbursement dashboard
3. Mark expense claim as reimbursed
4. Verify accounting entry status update

**Expected Results**:
- Expense claim status changes to 'reimbursed'
- Associated accounting entry status changes to 'paid'
- `payment_date` set on accounting entry

**Validation Queries**:
```sql
-- Verify reimbursement
SELECT status FROM expense_claims WHERE id = :claim_id;
-- Should be 'reimbursed'

-- Verify accounting entry marked paid
SELECT status, payment_date FROM accounting_entries
WHERE id = (SELECT accounting_entry_id FROM expense_claims WHERE id = :claim_id);
-- status should be 'paid', payment_date should be set
```

## Edge Case Test Cases

### TC-005: Multi-Currency Expense Claims
**Objective**: Verify foreign currency expenses convert properly
**Prerequisites**: Business configured with home currency different from expense currency

**Steps**:
1. Submit expense claim with foreign currency receipt
2. Verify currency conversion in processing metadata
3. Approve claim
4. Verify accounting entry has both original and home currency amounts

**Expected Results**:
- `processing_metadata.financial_data` contains:
  - `original_currency` and `total_amount`
  - `home_currency` and `home_currency_amount`
  - `exchange_rate` used for conversion
- Accounting entry reflects home currency amounts

### TC-006: Line Items Processing
**Objective**: Verify detailed line items are extracted and stored correctly
**Prerequisites**: Receipt with multiple line items

**Steps**:
1. Upload itemized receipt (restaurant bill, office supplies)
2. Verify OCR extracts line items
3. Approve expense claim
4. Verify line items table populated

**Expected Results**:
- `processing_metadata.line_items` array populated
- After approval, `line_items` table contains detailed records
- Line item totals match expense total

### TC-007: Large Receipt Processing
**Objective**: Verify system handles large receipt files
**Prerequisites**: High-resolution PDF receipt (>10MB)

**Steps**:
1. Upload large receipt file
2. Monitor background job processing
3. Verify OCR completes without timeout
4. Check processing performance metrics

**Expected Results**:
- File uploads successfully to Supabase Storage
- Background job completes within timeout limits
- OCR extraction succeeds
- Performance metrics logged

## Data Integrity Test Cases

### TC-008: Accounting Principles Validation
**Objective**: Ensure only approved expenses create accounting entries
**Prerequisites**: Multiple expense claims in different states

**Test Matrix**:
| Expense Status | Accounting Entry Expected | Test Result |
|---------------|-------------------------|-------------|
| draft         | No                      | ✓ Pass      |
| submitted     | No                      | ✓ Pass      |
| approved      | Yes                     | ✓ Pass      |
| rejected      | No                      | ✓ Pass      |
| reimbursed    | Yes (status='paid')     | ✓ Pass      |

### TC-009: RPC Function Error Handling
**Objective**: Verify RPC function handles invalid data gracefully
**Prerequisites**: Expense claim with corrupted processing_metadata

**Steps**:
1. Create expense claim with invalid metadata
2. Attempt approval
3. Verify error handling and rollback

**Expected Results**:
- RPC function raises appropriate exception
- No partial accounting entries created
- Expense claim status remains 'submitted'
- Error logged for debugging

## Performance Test Cases

### TC-010: Concurrent Approval Processing
**Objective**: Verify system handles multiple simultaneous approvals
**Prerequisites**: Multiple pending expense claims

**Steps**:
1. Have multiple managers approve different claims simultaneously
2. Monitor database locks and performance
3. Verify all approvals process correctly

**Expected Results**:
- All approvals complete successfully
- No deadlocks or race conditions
- Accounting entries created atomically

### TC-011: Bulk Operations
**Objective**: Test system performance with large datasets
**Prerequisites**: 100+ expense claims for testing

**Steps**:
1. Create bulk expense claims
2. Process bulk approvals
3. Generate analytics reports
4. Monitor system performance

**Expected Results**:
- System maintains responsive performance
- Database queries remain optimized
- Background jobs process within SLA

## Security Test Cases

### TC-012: Row Level Security (RLS) Validation
**Objective**: Verify users can only access their own expense claims
**Prerequisites**: Multiple users with different business contexts

**Steps**:
1. Create expense claims for User A in Business 1
2. Login as User B from Business 2
3. Attempt to access User A's expense claims via API
4. Verify access denied

**Expected Results**:
- API returns empty results for unauthorized access
- RLS policies prevent cross-business data access
- Audit logs record access attempts

### TC-013: Manager Permission Validation
**Objective**: Verify only authorized managers can approve claims
**Prerequisites**: Employee user without manager role

**Steps**:
1. Login as employee (non-manager)
2. Attempt to access approval dashboard
3. Attempt direct API call to approve expense
4. Verify access denied

**Expected Results**:
- UI prevents access to approval functions
- API returns 403 Forbidden for unauthorized approval attempts
- Security events logged

## Integration Test Cases

### TC-014: End-to-End Workflow Integration
**Objective**: Complete workflow from submission to financial reporting
**Prerequisites**: Full system setup with all domains

**Steps**:
1. Employee submits multiple expense claims
2. Manager approves subset of claims
3. Finance processes reimbursements
4. Analytics generates expense reports
5. Audit trail review

**Expected Results**:
- Complete audit trail maintained
- Financial reports reflect only approved expenses
- Analytics exclude pending/rejected claims
- All domain interactions work correctly

### TC-015: Background Job Integration
**Objective**: Verify Trigger.dev integration works correctly
**Prerequisites**: Trigger.dev configured and running

**Steps**:
1. Submit expense claim with receipt
2. Monitor background job execution
3. Verify job completion and status updates
4. Test job failure and retry scenarios

**Expected Results**:
- Jobs execute within expected timeframes
- Status updates propagate correctly
- Failed jobs retry automatically
- Job monitoring dashboard shows accurate status

## Regression Test Cases

### TC-016: API Endpoint Migration Validation
**Objective**: Ensure all API v1 endpoints function correctly
**Prerequisites**: Updated codebase with v1 API routes

**Test Coverage**:
- `GET /api/v1/expense-claims` - List claims
- `POST /api/v1/expense-claims` - Create claim
- `PUT /api/v1/expense-claims/{id}` - Update status
- `GET /api/v1/expense-claims/analytics` - Dashboard data
- `GET /api/v1/expense-claims/categories` - Category management

**Expected Results**:
- All endpoints return correct HTTP status codes
- Response schemas match API contracts
- Authentication and authorization work correctly
- Error handling provides meaningful messages

## Test Data Cleanup

After test execution:
1. Remove test expense claims and accounting entries
2. Clean up uploaded test files from Supabase Storage
3. Clear background job history
4. Reset test user states

## Automation Notes

These test cases can be automated using:
- **API Testing**: Postman/Newman or Jest supertest
- **E2E Testing**: Playwright or Cypress
- **Database Testing**: Direct SQL validation queries
- **Background Jobs**: Trigger.dev testing utilities

Priority for automation:
1. Core workflow (TC-001 to TC-004) - High priority
2. Data integrity (TC-008, TC-009) - High priority
3. Security tests (TC-012, TC-013) - Medium priority
4. Performance tests (TC-010, TC-011) - Low priority (manual)