/**
 * Expense Reports API Test Script
 *
 * Instructions:
 * 1. Start your Next.js development server: npm run dev
 * 2. Navigate to: http://localhost:3000/en/expense-claims
 * 3. Open browser console (F12)
 * 4. Copy and paste this entire script into console
 * 5. Run: testExpenseReportsAPI()
 */

async function testExpenseReportsAPI() {
  console.log('🧪 Starting Expense Reports API Tests...\n');

  const baseUrl = '/api/v1/expense-claims/reports';
  let passedTests = 0;
  let totalTests = 0;

  // Helper function to run a test
  async function runTest(testName, testFunction) {
    totalTests++;
    console.log(`\n🔍 Test ${totalTests}: ${testName}`);
    console.log('━'.repeat(50));

    try {
      const result = await testFunction();
      if (result.passed) {
        console.log('✅ PASSED');
        passedTests++;
      } else {
        console.log('❌ FAILED:', result.reason);
      }

      if (result.data) {
        console.log('📊 Response:', result.data);
      }
    } catch (error) {
      console.log('💥 ERROR:', error.message);
    }
  }

  // Test 1: Missing month parameter
  await runTest('Missing Month Parameter', async () => {
    const response = await fetch(`${baseUrl}`);
    const data = await response.json();

    return {
      passed: !data.success && data.error.includes('Month parameter is required'),
      reason: data.success ? 'Should fail without month parameter' : null,
      data: data
    };
  });

  // Test 2: Invalid month format
  await runTest('Invalid Month Format', async () => {
    const response = await fetch(`${baseUrl}?month=2025/01`);
    const data = await response.json();

    return {
      passed: !data.success && data.error.includes('Invalid month format'),
      reason: data.success ? 'Should fail with invalid month format' : null,
      data: data
    };
  });

  // Test 3: Valid month format (current month)
  await runTest('Valid Month Format - Current Month', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const response = await fetch(`${baseUrl}?month=${currentMonth}`);
    const data = await response.json();

    const hasCorrectStructure = data.success &&
      data.data &&
      data.data.hasOwnProperty('month') &&
      data.data.hasOwnProperty('employeeName') &&
      data.data.hasOwnProperty('totalAmount') &&
      data.data.hasOwnProperty('groupedClaims') &&
      data.data.hasOwnProperty('summary') &&
      data.data.hasOwnProperty('metadata');

    return {
      passed: hasCorrectStructure,
      reason: !hasCorrectStructure ? 'Response structure invalid' : null,
      data: data
    };
  });

  // Test 4: Valid month format (previous month)
  await runTest('Valid Month Format - Previous Month', async () => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const monthStr = lastMonth.toISOString().slice(0, 7);

    const response = await fetch(`${baseUrl}?month=${monthStr}`);
    const data = await response.json();

    return {
      passed: data.success && data.data.month === monthStr,
      reason: !data.success ? data.error : (data.data.month !== monthStr ? 'Month mismatch' : null),
      data: data
    };
  });

  // Test 5: Employee filtering (should fail for non-managers)
  await runTest('Employee ID Filtering Permission Check', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const response = await fetch(`${baseUrl}?month=${currentMonth}&employeeId=dummy-user-id`);
    const data = await response.json();

    // This should either work (if user is manager/admin) or fail with permission error
    const isPermissionError = !data.success && data.error.includes('Only managers and admins');
    const isSuccessfulManagerRequest = data.success && data.data.metadata.scope === 'single_employee';

    return {
      passed: isPermissionError || isSuccessfulManagerRequest,
      reason: (!isPermissionError && !isSuccessfulManagerRequest) ? 'Unexpected response for employee filtering' : null,
      data: data
    };
  });

  // Test 6: Response structure validation
  await runTest('Response Structure Validation', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const response = await fetch(`${baseUrl}?month=${currentMonth}`);
    const data = await response.json();

    if (!data.success) {
      return {
        passed: false,
        reason: `API call failed: ${data.error}`,
        data: data
      };
    }

    const requiredFields = {
      'month': 'string',
      'employeeName': 'string',
      'totalAmount': 'number',
      'currency': 'string',
      'groupedClaims': 'object',
      'summary': 'object',
      'metadata': 'object'
    };

    const missingFields = [];
    for (const [field, type] of Object.entries(requiredFields)) {
      if (!(field in data.data)) {
        missingFields.push(`Missing field: ${field}`);
      } else if (typeof data.data[field] !== type) {
        missingFields.push(`Wrong type for ${field}: expected ${type}, got ${typeof data.data[field]}`);
      }
    }

    // Check summary structure
    const summaryFields = ['totalClaims', 'totalAmount', 'byStatus'];
    for (const field of summaryFields) {
      if (!(field in data.data.summary)) {
        missingFields.push(`Missing summary.${field}`);
      }
    }

    // Check metadata structure
    const metadataFields = ['generatedAt', 'generatedBy', 'businessId', 'requestedByRole', 'scope'];
    for (const field of metadataFields) {
      if (!(field in data.data.metadata)) {
        missingFields.push(`Missing metadata.${field}`);
      }
    }

    return {
      passed: missingFields.length === 0,
      reason: missingFields.length > 0 ? missingFields.join(', ') : null,
      data: missingFields.length === 0 ? 'All required fields present' : { missingFields, response: data }
    };
  });

  // Test 7: Grouped claims validation
  await runTest('Grouped Claims Structure Validation', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const response = await fetch(`${baseUrl}?month=${currentMonth}`);
    const data = await response.json();

    if (!data.success) {
      return {
        passed: false,
        reason: `API call failed: ${data.error}`,
        data: data
      };
    }

    const groupedClaims = data.data.groupedClaims;
    const issues = [];

    // Check if it's an object
    if (typeof groupedClaims !== 'object' || Array.isArray(groupedClaims)) {
      issues.push('groupedClaims should be an object');
    } else {
      // Check each category structure
      for (const [categoryCode, categoryData] of Object.entries(groupedClaims)) {
        const requiredFields = ['categoryCode', 'categoryName', 'accountingCategory', 'totalAmount', 'claimsCount', 'claims'];

        for (const field of requiredFields) {
          if (!(field in categoryData)) {
            issues.push(`Category ${categoryCode} missing field: ${field}`);
          }
        }

        // Validate claims array
        if (Array.isArray(categoryData.claims)) {
          for (let i = 0; i < Math.min(categoryData.claims.length, 3); i++) { // Check first 3 claims
            const claim = categoryData.claims[i];
            const claimFields = ['id', 'description', 'amount', 'currency', 'transactionDate', 'status'];

            for (const field of claimFields) {
              if (!(field in claim)) {
                issues.push(`Claim in ${categoryCode}[${i}] missing field: ${field}`);
              }
            }
          }
        }
      }
    }

    return {
      passed: issues.length === 0,
      reason: issues.length > 0 ? issues.slice(0, 5).join(', ') : null,
      data: issues.length === 0 ? `Valid structure with ${Object.keys(groupedClaims).length} categories` : { issues: issues.slice(0, 10) }
    };
  });

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('🎯 TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
  console.log(`📊 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! The expense reports API is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the detailed output above.');
  }

  console.log('\n📝 Next Steps:');
  console.log('1. Test the frontend UI by generating reports in the browser');
  console.log('2. Create test expense claims with different categories');
  console.log('3. Verify role-based access with different user roles');
  console.log('4. Test with larger datasets');
}

// Helper function to create test data
async function createTestExpenseClaim() {
  console.log('🔧 Creating test expense claim...');

  const testData = {
    description: 'Test Expense for Reporting',
    business_purpose: 'API Testing',
    expense_category: 'OFFICE_SUPPLIES',
    original_amount: 99.99,
    original_currency: 'SGD',
    transaction_date: new Date().toISOString().split('T')[0],
    vendor_name: 'Test Vendor'
  };

  try {
    const response = await fetch('/api/v1/expense-claims', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });

    const result = await response.json();
    if (result.success) {
      console.log('✅ Test expense claim created:', result.data.id);
      return result.data;
    } else {
      console.log('❌ Failed to create test claim:', result.error);
      return null;
    }
  } catch (error) {
    console.log('💥 Error creating test claim:', error.message);
    return null;
  }
}

// Quick frontend test
function testFrontendIntegration() {
  console.log('🎨 Testing Frontend Integration...\n');

  // Check if we're on the right page
  if (!window.location.pathname.includes('expense-claims')) {
    console.log('❌ Please navigate to the expense claims page first');
    console.log('Go to: http://localhost:3000/en/expense-claims');
    return;
  }

  // Look for the monthly report generator
  const reportSection = document.querySelector('[class*="monthly-report"]') ||
                       document.querySelector('h1, h2, h3, h4').parentElement;

  if (reportSection) {
    console.log('✅ Found report section in DOM');
  } else {
    console.log('⚠️  Could not find report section - check component rendering');
  }

  // Check for month selector
  const monthSelect = document.querySelector('select') ||
                      document.querySelector('[role="combobox"]');

  if (monthSelect) {
    console.log('✅ Found month selector');
  } else {
    console.log('⚠️  Could not find month selector');
  }

  // Check for generate button
  const generateBtn = Array.from(document.querySelectorAll('button'))
                          .find(btn => btn.textContent.includes('Preview') ||
                                      btn.textContent.includes('Generate'));

  if (generateBtn) {
    console.log('✅ Found generate button');
  } else {
    console.log('⚠️  Could not find generate button');
  }

  console.log('\n📋 Manual Frontend Test Steps:');
  console.log('1. Select a month from the dropdown');
  console.log('2. Click "Preview Report"');
  console.log('3. Check if report loads with category breakdown');
  console.log('4. Verify summary cards show correct data');
}

// Export functions for easy access
window.testExpenseReportsAPI = testExpenseReportsAPI;
window.createTestExpenseClaim = createTestExpenseClaim;
window.testFrontendIntegration = testFrontendIntegration;

console.log('🧪 Expense Reports Test Suite Loaded!');
console.log('');
console.log('Available Commands:');
console.log('• testExpenseReportsAPI()     - Run full API test suite');
console.log('• createTestExpenseClaim()    - Create test data');
console.log('• testFrontendIntegration()   - Check frontend components');
console.log('');
console.log('Quick Start: Run testExpenseReportsAPI() to begin testing!');