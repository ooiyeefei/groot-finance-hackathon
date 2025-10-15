# Expense Reports API - Test Cases

## Overview
Test cases for the new expense reporting system (`GET /api/v1/expense-claims/reports`) covering authentication, RBAC, data validation, and frontend integration.

---

## 🧪 API Endpoint Tests

### Authentication & Authorization Tests

#### Test Case 1: Unauthenticated Request
```bash
# Expected: 401 Unauthorized
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports?month=2025-01" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

#### Test Case 2: Valid Authentication
```bash
# Replace with valid Clerk session token
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports?month=2025-01" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CLERK_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "month": "2025-01",
    "employeeName": "John Doe",
    "totalAmount": 1500.00,
    "currency": "SGD",
    "groupedClaims": {...},
    "summary": {...},
    "metadata": {...}
  }
}
```

### Parameter Validation Tests

#### Test Case 3: Missing Month Parameter
```bash
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Month parameter is required (format: YYYY-MM)"
}
```

#### Test Case 4: Invalid Month Format
```bash
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports?month=2025/01" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Invalid month format. Use YYYY-MM format (e.g., 2025-01)"
}
```

#### Test Case 5: Valid Month Format
```bash
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports?month=2025-01" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Role-Based Access Control Tests

#### Test Case 6: Employee Personal Report
```bash
# As Employee - should only see own claims
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports?month=2025-01" \
  -H "Authorization: Bearer EMPLOYEE_TOKEN"
```

**Validation:**
- `metadata.scope` should be "personal"
- `metadata.requestedByRole` should be "employee"
- All claims should belong to the authenticated user

#### Test Case 7: Manager Team Report
```bash
# As Manager - should see team + own claims
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports?month=2025-01" \
  -H "Authorization: Bearer MANAGER_TOKEN"
```

**Validation:**
- `metadata.scope` should be "team"
- `metadata.requestedByRole` should be "manager"
- Claims should include manager's own + team members

#### Test Case 8: Admin Company Report
```bash
# As Admin - should see all claims in business
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports?month=2025-01" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Validation:**
- `metadata.scope` should be "company"
- `metadata.requestedByRole` should be "admin"
- Claims should include all business users

#### Test Case 9: Employee Trying to Filter by EmployeeId
```bash
# Should be rejected - employees can't filter by other employees
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports?month=2025-01&employeeId=OTHER_USER_ID" \
  -H "Authorization: Bearer EMPLOYEE_TOKEN"
```

**Expected Response:**
```json
{
  "success": false,
  "error": "Only managers and admins can filter by employee ID"
}
```

#### Test Case 10: Manager Filtering by Specific Employee
```bash
# Should work - managers can filter by employee
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports?month=2025-01&employeeId=TEAM_MEMBER_ID" \
  -H "Authorization: Bearer MANAGER_TOKEN"
```

**Validation:**
- `metadata.scope` should be "single_employee"
- All claims should belong to the specified employee

### Data Structure Tests

#### Test Case 11: Empty Report (No Claims)
```bash
# Query month with no expense claims
curl -X GET "http://localhost:3000/api/v1/expense-claims/reports?month=2023-01" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response Structure:**
```json
{
  "success": true,
  "data": {
    "month": "2023-01",
    "employeeName": "John Doe",
    "totalAmount": 0,
    "currency": "SGD",
    "groupedClaims": {},
    "summary": {
      "totalClaims": 0,
      "totalAmount": 0,
      "byStatus": {
        "draft": 0,
        "submitted": 0,
        "approved": 0,
        "rejected": 0,
        "reimbursed": 0
      }
    }
  }
}
```

#### Test Case 12: Report with Claims
**Validation Points:**
- `groupedClaims` should group by expense category
- Each category should have: `categoryCode`, `categoryName`, `accountingCategory`, `totalAmount`, `claimsCount`, `claims[]`
- `summary.byStatus` counts should add up to `summary.totalClaims`
- `currency` should match user's home currency
- Claims within each category should be sorted by `transactionDate`

---

## 🎨 Frontend Integration Tests

### Test Case 13: Monthly Report Generator Component

**Steps to Test:**
1. Navigate to: `http://localhost:3000/en/expense-claims`
2. Find the "Generate Monthly Report" section
3. Select a month from dropdown (e.g., "January 2025")
4. Click "Preview Report"

**Expected Behavior:**
- Loading state should appear
- Report should load with category breakdown cards
- Summary cards should show correct counts
- Report metadata should show generation timestamp

### Test Case 14: Role-Based UI Elements

**For Employees:**
- Employee dropdown should only show "My Reports"
- Should not see other employees in dropdown

**For Managers:**
- Employee dropdown should show "My Reports" + team members
- Should be able to select team members

**For Admins:**
- Employee dropdown should show "My Reports" + all business users
- Should be able to select any user

### Test Case 15: Error Handling in UI

**Test Invalid Month:**
1. Select a month
2. Clear browser cache (to simulate network error)
3. Click "Preview Report"

**Expected:**
- Error message should appear in red alert box
- Loading state should clear
- No report should be displayed

---

## 📊 Data Integrity Tests

### Test Case 16: Category Totals Validation

**Manual Verification:**
1. Generate report for a month with multiple expense claims
2. For each category in `groupedClaims`:
   - Sum all `claims[].amount` values
   - Compare to `totalAmount` in category
   - Verify `claimsCount` matches `claims.length`

### Test Case 17: Multi-Currency Handling

**Setup:**
- Create expense claims with different currencies
- Ensure currency conversion is working

**Validation:**
- All amounts in report should be in user's home currency
- Exchange rates should be applied correctly
- Original currency info should be preserved in claim details

### Test Case 18: Status Count Validation

**Verification:**
1. Get report data
2. Manually count claims by status in `groupedClaims`
3. Compare to `summary.byStatus` counts
4. Verify `summary.totalClaims` equals sum of all status counts

---

## 🔧 Performance Tests

### Test Case 19: Large Dataset Performance

**Setup:**
- Create 100+ expense claims for a single month
- Test report generation time

**Acceptance Criteria:**
- Response time < 5 seconds
- Memory usage reasonable
- No timeouts

### Test Case 20: Concurrent Requests

**Test:**
- Send 10 simultaneous requests for same report
- Verify all return consistent data
- No database locks or conflicts

---

## 🛠️ Quick Manual Test Script

Create a simple test script to verify basic functionality:

```javascript
// Test in browser console on expense-claims page
async function testReportAPI() {
  const testCases = [
    // Valid request
    { month: '2025-01', expected: 'success' },

    // Invalid month format
    { month: '2025/01', expected: 'error' },

    // Missing month
    { month: '', expected: 'error' }
  ];

  for (const test of testCases) {
    try {
      const params = new URLSearchParams();
      if (test.month) params.append('month', test.month);

      const response = await fetch(`/api/v1/expense-claims/reports?${params}`);
      const result = await response.json();

      console.log(`Test ${test.month || 'empty'}: ${result.success ? 'SUCCESS' : 'ERROR'}`);
      console.log('Response:', result);
    } catch (error) {
      console.error(`Test ${test.month} failed:`, error);
    }
  }
}

// Run tests
testReportAPI();
```

---

## ✅ Acceptance Criteria Checklist

### API Functionality
- [ ] Authentication required and working
- [ ] RBAC properly filtering data by role
- [ ] Month parameter validation working
- [ ] EmployeeId parameter working for managers/admins only
- [ ] Proper error responses for invalid inputs
- [ ] Response structure matches expected format

### Frontend Integration
- [ ] Component loads without errors
- [ ] Month selection working
- [ ] Employee filtering working (role-based)
- [ ] Report preview displaying correctly
- [ ] Category breakdown showing proper data
- [ ] Summary cards showing correct counts
- [ ] Error messages displaying appropriately

### Data Accuracy
- [ ] Claims grouped correctly by category
- [ ] Category totals calculated correctly
- [ ] Status counts accurate
- [ ] Multi-currency conversion working
- [ ] Role-based data filtering accurate
- [ ] Claims sorted by date within categories

### Performance & Reliability
- [ ] Response time acceptable (< 5s for normal datasets)
- [ ] No memory leaks or excessive resource usage
- [ ] Consistent results across multiple requests
- [ ] Proper handling of empty datasets

Run these tests to ensure the expense reporting system is working correctly across all scenarios!