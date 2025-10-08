# 🧪 Multi-Tenant Security Validation Test Cases

**Purpose**: Validate that JWT authentication fixes maintain proper business isolation, user reassociation, and multi-tenancy security.

**Test Environment**: Development server at `http://localhost:3001`

---

## 🔐 Test Setup Requirements

### Prerequisites
1. **Two Test Businesses**: Business A and Business B
2. **Three Test Users**:
   - User1 (member of Business A)
   - User2 (member of Business B)
   - User3 (member of both businesses)
3. **Test Data**: Sample transactions, expense claims, analytics data

### Authentication Context
- ✅ **Clerk JWT Template Active**: `clerk_user_id`, `role`, `metadata`
- ✅ **JWT Helper Function**: `get_jwt_claim()` working
- ✅ **RPC Functions Fixed**: All critical functions use Clerk JWT auth

---

## 📋 Test Categories

### 1. **Business Isolation Tests** 🏢
Verify users can only access data from their own business.

### 2. **Cross-Tenant Protection Tests** 🚫
Ensure users cannot access other businesses' data.

### 3. **User Reassociation Tests** 🔄
Validate business switching and membership changes work correctly.

### 4. **API Authentication Tests** 🔌
Test that all API endpoints properly authenticate with Clerk JWTs.

---

## 🧪 Detailed Test Cases

### **Category 1: Business Isolation Tests**

#### **Test 1.1: Dashboard Analytics Isolation**
```bash
# Test that analytics only show business-specific data

# Step 1: Login as User1 (Business A)
# Navigate to: http://localhost:3001/en/

# Step 2: Check analytics endpoint
curl -X POST "http://localhost:3001/api/analytics" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [USER1_JWT_TOKEN]" \
  -d '{"startDate": "2025-01-01", "endDate": "2025-01-31"}'

# Expected Result: ✅ Should return only Business A analytics data
# Expected Response: 200 OK with business A data only
```

#### **Test 1.2: Team Management Isolation**
```bash
# Test that team data shows only same-business members

# Step 1: Login as User1 (Business A Manager)
# Navigate to: http://localhost:3001/en/manager/teams

# Step 2: Call team API
curl -X GET "http://localhost:3001/api/user/team" \
  -H "Authorization: Bearer [USER1_JWT_TOKEN]"

# Expected Result: ✅ Should return only Business A team members
# Should NOT include User2 (Business B member)
```

#### **Test 1.3: Expense Claims Isolation**
```bash
# Test expense claims are business-scoped

# Step 1: Login as User2 (Business B)
# Navigate to: http://localhost:3001/en/expense-claims

# Step 2: Check expense claims API
curl -X GET "http://localhost:3001/api/expense-claims" \
  -H "Authorization: Bearer [USER2_JWT_TOKEN]"

# Expected Result: ✅ Should return only Business B expense claims
# Should NOT see any Business A expense claims
```

---

### **Category 2: Cross-Tenant Protection Tests**

#### **Test 2.1: Direct Business ID Manipulation**
```bash
# Test protection against business ID parameter tampering

# Step 1: Login as User1 (Business A)
# Step 2: Try to access Business B data by changing business_id parameter

curl -X POST "http://localhost:3001/rest/v1/rpc/get_dashboard_analytics" \
  -H "Authorization: Bearer [USER1_JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
    "p_user_id": "[BUSINESS_B_USER_UUID]",
    "p_start_date": "2025-01-01",
    "p_end_date": "2025-01-31"
  }'

# Expected Result: ❌ Should return 403/400 error
# Expected Error: "Unauthorized: Cannot access analytics from different business"
```

#### **Test 2.2: Expense Claim Cross-Access Attempt**
```bash
# Test that users cannot access other businesses' expense claims

# Step 1: Login as User1 (Business A)
# Step 2: Try to access Business B expense claim by ID

curl -X GET "http://localhost:3001/api/expense-claims/[BUSINESS_B_CLAIM_ID]" \
  -H "Authorization: Bearer [USER1_JWT_TOKEN]"

# Expected Result: ❌ Should return 403/404 error
# Expected Error: "Unauthorized: Cannot access expense claim from different business"
```

#### **Test 2.3: Team Data Cross-Access Attempt**
```bash
# Test that managers cannot see other businesses' team data

# Step 1: Login as User1 (Business A Manager)
# Step 2: Try to call get_manager_team_employees with Business B ID

curl -X POST "http://localhost:3001/rest/v1/rpc/get_manager_team_employees" \
  -H "Authorization: Bearer [USER1_JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
    "manager_user_id": "[USER1_UUID]",
    "business_id_param": "[BUSINESS_B_UUID]"
  }'

# Expected Result: ❌ Should return 403 error
# Expected Error: "Unauthorized: Cannot access data from different business"
```

---

### **Category 3: User Reassociation Tests**

#### **Test 3.1: Multi-Business User Access**
```bash
# Test User3 who is member of both businesses can switch properly

# Step 1: Login as User3
# Step 2: Verify current business context
curl -X GET "http://localhost:3001/api/user/context" \
  -H "Authorization: Bearer [USER3_JWT_TOKEN]"

# Step 3: Switch to Business A
curl -X POST "http://localhost:3001/api/business/switch" \
  -H "Authorization: Bearer [USER3_JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"businessId": "[BUSINESS_A_UUID]"}'

# Step 4: Verify analytics shows Business A data
curl -X POST "http://localhost:3001/api/analytics" \
  -H "Authorization: Bearer [USER3_NEW_JWT_TOKEN]" \
  -d '{"startDate": "2025-01-01", "endDate": "2025-01-31"}'

# Expected Result: ✅ Should switch context and show Business A data only
```

#### **Test 3.2: Business Context Auto-Switch**
```bash
# Test that BusinessContextProvider auto-switches to recent business

# Step 1: User3 switches to Business B via API
# Step 2: Close browser and reopen application
# Navigate to: http://localhost:3001/en/

# Step 3: Check that user is automatically in Business B context
# Verify via network tab: JWT should contain Business B context

# Expected Result: ✅ Auto-switch to most recently accessed business (Business B)
```

#### **Test 3.3: Removed User Access Test**
```bash
# Test that removed users cannot access business data

# Step 1: Remove User1 from Business A (change status to 'removed')
UPDATE business_memberships
SET status = 'removed', updated_at = NOW()
WHERE user_id = '[USER1_UUID]' AND business_id = '[BUSINESS_A_UUID]';

# Step 2: User1 tries to access Business A data
curl -X GET "http://localhost:3001/api/user/team" \
  -H "Authorization: Bearer [USER1_JWT_TOKEN]"

# Expected Result: ❌ Should return 403/401 error
# Expected Error: "User is not a member of business" or redirect to onboarding
```

---

### **Category 4: API Authentication Tests**

#### **Test 4.1: Missing JWT Token**
```bash
# Test API protection without JWT token

curl -X POST "http://localhost:3001/rest/v1/rpc/get_dashboard_analytics" \
  -H "Content-Type: application/json" \
  -d '{
    "p_user_id": "[ANY_USER_UUID]",
    "p_start_date": "2025-01-01",
    "p_end_date": "2025-01-31"
  }'

# Expected Result: ❌ Should return 401 error
# Expected Error: "Authentication required - no Clerk user ID in JWT"
```

#### **Test 4.2: Invalid JWT Token**
```bash
# Test API protection with malformed JWT

curl -X POST "http://localhost:3001/rest/v1/rpc/get_dashboard_analytics" \
  -H "Authorization: Bearer invalid_jwt_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "p_user_id": "[ANY_USER_UUID]",
    "p_start_date": "2025-01-01",
    "p_end_date": "2025-01-31"
  }'

# Expected Result: ❌ Should return 401/403 error
# Expected Error: JWT validation failure
```

#### **Test 4.3: Expired JWT Token**
```bash
# Test API protection with expired JWT

curl -X POST "http://localhost:3001/rest/v1/rpc/get_dashboard_analytics" \
  -H "Authorization: Bearer [EXPIRED_JWT_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
    "p_user_id": "[ANY_USER_UUID]",
    "p_start_date": "2025-01-01",
    "p_end_date": "2025-01-31"
  }'

# Expected Result: ❌ Should return 401 error
# Expected Error: JWT expired or invalid
```

---

## 🎯 Success Criteria

### ✅ **All Tests Should Pass If:**

1. **Business Isolation Working**:
   - Users only see data from their assigned business
   - Analytics, team data, expense claims are properly scoped
   - No cross-business data leakage

2. **Cross-Tenant Protection Active**:
   - Parameter tampering attempts fail with proper errors
   - Direct business ID manipulation blocked
   - Proper error messages returned (not generic 500s)

3. **User Reassociation Functional**:
   - Multi-business users can switch contexts
   - Auto-switch works for most recent business
   - Removed users are properly blocked

4. **API Authentication Robust**:
   - Missing/invalid/expired tokens properly rejected
   - Error messages indicate JWT authentication is working
   - No `auth.uid()` related errors

### 🚨 **Failure Indicators**:

- Any 500 errors mentioning "Authentication required"
- Users seeing data from other businesses
- Auto-switch not working for multi-business users
- API endpoints accessible without valid JWT tokens
- `auth.uid()` errors in logs (indicates incomplete fix)

---

## 📊 Test Execution Checklist

```markdown
### Business Isolation Tests
- [ ] Test 1.1: Dashboard Analytics Isolation
- [ ] Test 1.2: Team Management Isolation
- [ ] Test 1.3: Expense Claims Isolation

### Cross-Tenant Protection Tests
- [ ] Test 2.1: Direct Business ID Manipulation
- [ ] Test 2.2: Expense Claim Cross-Access Attempt
- [ ] Test 2.3: Team Data Cross-Access Attempt

### User Reassociation Tests
- [ ] Test 3.1: Multi-Business User Access
- [ ] Test 3.2: Business Context Auto-Switch
- [ ] Test 3.3: Removed User Access Test

### API Authentication Tests
- [ ] Test 4.1: Missing JWT Token
- [ ] Test 4.2: Invalid JWT Token
- [ ] Test 4.3: Expired JWT Token
```

---

## 🔧 Debugging Tips

### **If Tests Fail**:

1. **Check JWT Claims**: Verify JWT contains `clerk_user_id` and `role`
2. **Verify User Mapping**: Ensure `users.clerk_user_id` maps correctly
3. **Business Membership**: Check `business_memberships.status = 'active'`
4. **Function Logs**: Look for specific error messages from RPC functions
5. **Middleware Logs**: Check middleware console logs for routing issues

### **Key Log Messages to Look For**:
- ✅ `"Authentication required - no Clerk user ID in JWT"` (JWT auth working)
- ✅ `"Unauthorized: Cannot access data from different business"` (isolation working)
- ❌ Any mention of `auth.uid()` (incomplete fix)
- ❌ Generic 500 errors without specific messages (broken functions)

---

**Test Status**: Ready for execution ✅
**Critical Functions**: All updated with Clerk JWT authentication
**Expected Result**: Complete multi-tenant security with business isolation maintained