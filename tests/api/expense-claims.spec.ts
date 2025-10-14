/**
 * North Star Expense Claims API v1 - Comprehensive Test Suite
 * Tests all five core CRUD endpoints:
 * - POST /api/v1/expense-claims (create)
 * - GET /api/v1/expense-claims/{id} (get single)
 * - GET /api/v1/expense-claims (list)
 * - PUT /api/v1/expense-claims/{id} (update status)
 * - DELETE /api/v1/expense-claims/{id} (delete)
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TEST_USER = process.env.TEST_USER || 'test@example.com'
const TEST_USER_PW = process.env.TEST_USER_PW || 'test123'

// Test data
const EXPENSE_CLAIM_DATA = {
  description: 'Test Business Meal',
  business_purpose: 'Client dinner meeting',
  expense_category: 'entertainment',
  original_amount: 125.50,
  original_currency: 'SGD',
  transaction_date: new Date().toISOString().split('T')[0],
  vendor_name: 'Restaurant ABC',
  reference_number: `TEST-${Date.now()}`, // Unique reference to avoid duplicates
  notes: 'Team dinner with new client - Playwright test'
}

let authToken: string
let createdClaimId: string

test.describe('North Star Expense Claims API v1', () => {

  test.beforeAll(async ({ request }) => {
    // Authenticate and get session token
    // This assumes Clerk authentication - adjust based on your auth setup
    const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: TEST_USER,
        password: TEST_USER_PW
      }
    })

    if (loginResponse.ok()) {
      const cookies = loginResponse.headers()['set-cookie']
      authToken = cookies || ''
    } else {
      console.log('Login failed, trying alternative auth method...')
      // Alternative: Use clerk session token from environment
      authToken = process.env.CLERK_SESSION_TOKEN || ''
    }
  })

  test('1. POST /api/v1/expense-claims - Create new expense claim', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/expense-claims`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authToken
      },
      data: EXPENSE_CLAIM_DATA
    })

    expect(response.status()).toBe(200)

    const responseBody = await response.json()
    expect(responseBody.success).toBe(true)
    expect(responseBody.data).toBeDefined()
    expect(responseBody.data.expense_claim).toBeDefined()

    const claim = responseBody.data.expense_claim
    expect(claim.id).toBeDefined()
    expect(claim.description).toBe(EXPENSE_CLAIM_DATA.description)
    expect(claim.business_purpose).toBe(EXPENSE_CLAIM_DATA.business_purpose)
    expect(claim.expense_category).toBe(EXPENSE_CLAIM_DATA.expense_category)
    expect(claim.total_amount).toBe(EXPENSE_CLAIM_DATA.original_amount)
    expect(claim.currency).toBe(EXPENSE_CLAIM_DATA.original_currency)
    expect(claim.vendor_name).toBe(EXPENSE_CLAIM_DATA.vendor_name)
    expect(claim.status).toBe('draft')

    // Store the ID for subsequent tests
    createdClaimId = claim.id

    console.log('✅ Created expense claim:', createdClaimId)
  })

  test('2. GET /api/v1/expense-claims/{id} - Fetch single expense claim', async ({ request }) => {
    expect(createdClaimId).toBeDefined()

    const response = await request.get(`${BASE_URL}/api/v1/expense-claims/${createdClaimId}`, {
      headers: {
        'Cookie': authToken
      }
    })

    expect(response.status()).toBe(200)

    const responseBody = await response.json()
    expect(responseBody.success).toBe(true)
    expect(responseBody.data).toBeDefined()

    const claim = responseBody.data
    expect(claim.id).toBe(createdClaimId)
    expect(claim.description).toBe(EXPENSE_CLAIM_DATA.description)
    expect(claim.business_purpose).toBe(EXPENSE_CLAIM_DATA.business_purpose)
    expect(claim.status).toBe('draft')

    // Verify transaction interface is properly constructed
    expect(claim.transaction).toBeDefined()
    expect(claim.transaction.description).toBe(EXPENSE_CLAIM_DATA.description)
    expect(claim.transaction.original_amount).toBe(EXPENSE_CLAIM_DATA.original_amount)
    expect(claim.transaction.vendor_name).toBe(EXPENSE_CLAIM_DATA.vendor_name)

    console.log('✅ Retrieved expense claim:', claim.id)
  })

  test('3. GET /api/v1/expense-claims - List expense claims', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/expense-claims?limit=10&sort_order=desc`, {
      headers: {
        'Cookie': authToken
      }
    })

    expect(response.status()).toBe(200)

    const responseBody = await response.json()
    expect(responseBody.success).toBe(true)
    expect(responseBody.data).toBeDefined()
    expect(responseBody.data.claims).toBeDefined()
    expect(responseBody.data.pagination).toBeDefined()

    const claims = responseBody.data.claims
    expect(Array.isArray(claims)).toBe(true)

    // Verify our created claim is in the list
    const createdClaim = claims.find((claim: any) => claim.id === createdClaimId)
    expect(createdClaim).toBeDefined()
    expect(createdClaim.description).toBe(EXPENSE_CLAIM_DATA.description)

    // Verify pagination structure
    const pagination = responseBody.data.pagination
    expect(pagination.page).toBeDefined()
    expect(pagination.limit).toBeDefined()
    expect(pagination.total).toBeDefined()
    expect(pagination.has_more).toBeDefined()
    expect(pagination.total_pages).toBeDefined()

    console.log('✅ Listed expense claims, found:', claims.length)
  })

  test('4. PUT /api/v1/expense-claims/{id} - Update status to submitted', async ({ request }) => {
    expect(createdClaimId).toBeDefined()

    const updateData = {
      status: 'submitted',
      comment: 'Submitting for manager approval - Playwright test'
    }

    const response = await request.put(`${BASE_URL}/api/v1/expense-claims/${createdClaimId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authToken
      },
      data: updateData
    })

    expect(response.status()).toBe(200)

    const responseBody = await response.json()
    expect(responseBody.success).toBe(true)
    expect(responseBody.data).toBeDefined()

    const claim = responseBody.data
    expect(claim.id).toBe(createdClaimId)
    expect(claim.status).toBe('submitted')
    expect(claim.submission_date).toBeDefined()

    // Verify the status change was persisted
    const verifyResponse = await request.get(`${BASE_URL}/api/v1/expense-claims/${createdClaimId}`, {
      headers: {
        'Cookie': authToken
      }
    })

    const verifyBody = await verifyResponse.json()
    expect(verifyBody.data.status).toBe('submitted')

    console.log('✅ Updated expense claim status to:', claim.status)
  })

  test('5. PUT /api/v1/expense-claims/{id} - Update field data (should fail for submitted claim)', async ({ request }) => {
    expect(createdClaimId).toBeDefined()

    const updateData = {
      description: 'Updated description - should fail'
    }

    const response = await request.put(`${BASE_URL}/api/v1/expense-claims/${createdClaimId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authToken
      },
      data: updateData
    })

    // Should fail because claim is no longer in draft status
    expect(response.status()).toBe(400)

    const responseBody = await response.json()
    expect(responseBody.success).toBe(false)
    expect(responseBody.error).toContain('Cannot edit expense claims')

    console.log('✅ Correctly prevented editing submitted claim')
  })

  test('6. PUT /api/v1/expense-claims/{id} - Recall claim to draft', async ({ request }) => {
    expect(createdClaimId).toBeDefined()

    const updateData = {
      status: 'draft'
    }

    const response = await request.put(`${BASE_URL}/api/v1/expense-claims/${createdClaimId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authToken
      },
      data: updateData
    })

    expect(response.status()).toBe(200)

    const responseBody = await response.json()
    expect(responseBody.success).toBe(true)

    const claim = responseBody.data
    expect(claim.status).toBe('draft')
    expect(claim.submission_date).toBeNull()

    console.log('✅ Recalled expense claim to draft status')
  })

  test('7. DELETE /api/v1/expense-claims/{id} - Delete expense claim', async ({ request }) => {
    expect(createdClaimId).toBeDefined()

    const response = await request.delete(`${BASE_URL}/api/v1/expense-claims/${createdClaimId}`, {
      headers: {
        'Cookie': authToken
      }
    })

    expect(response.status()).toBe(200)

    const responseBody = await response.json()
    expect(responseBody.success).toBe(true)
    expect(responseBody.message).toContain('deleted successfully')

    // Verify the claim is actually deleted
    const verifyResponse = await request.get(`${BASE_URL}/api/v1/expense-claims/${createdClaimId}`, {
      headers: {
        'Cookie': authToken
      }
    })

    expect(verifyResponse.status()).toBe(404)

    console.log('✅ Successfully deleted expense claim:', createdClaimId)
  })

  test('8. Test error cases - Create claim with missing fields', async ({ request }) => {
    const incompleteData = {
      description: 'Incomplete claim'
      // Missing required fields
    }

    const response = await request.post(`${BASE_URL}/api/v1/expense-claims`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authToken
      },
      data: incompleteData
    })

    expect(response.status()).toBe(400)

    const responseBody = await response.json()
    expect(responseBody.success).toBe(false)
    expect(responseBody.error).toContain('Missing required fields')

    console.log('✅ Correctly validated required fields')
  })

  test('9. Test error cases - Get non-existent claim', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const response = await request.get(`${BASE_URL}/api/v1/expense-claims/${fakeId}`, {
      headers: {
        'Cookie': authToken
      }
    })

    expect(response.status()).toBe(404)

    const responseBody = await response.json()
    expect(responseBody.success).toBe(false)
    expect(responseBody.error).toContain('not found')

    console.log('✅ Correctly handled non-existent claim')
  })

  test('10. Test duplicate detection', async ({ request }) => {
    // Create first claim
    const firstResponse = await request.post(`${BASE_URL}/api/v1/expense-claims`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authToken
      },
      data: {
        ...EXPENSE_CLAIM_DATA,
        reference_number: `DUPLICATE-TEST-${Date.now()}`
      }
    })

    expect(firstResponse.status()).toBe(200)
    const firstBody = await firstResponse.json()
    const firstClaimId = firstBody.data.expense_claim.id

    // Try to create duplicate
    const duplicateResponse = await request.post(`${BASE_URL}/api/v1/expense-claims`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authToken
      },
      data: {
        ...EXPENSE_CLAIM_DATA,
        reference_number: firstBody.data.expense_claim.reference_number
      }
    })

    expect(duplicateResponse.status()).toBe(409)

    const duplicateBody = await duplicateResponse.json()
    expect(duplicateBody.success).toBe(false)
    expect(duplicateBody.error).toBe('duplicate_detected')
    expect(duplicateBody.duplicateData).toBeDefined()

    // Cleanup
    await request.delete(`${BASE_URL}/api/v1/expense-claims/${firstClaimId}`, {
      headers: { 'Cookie': authToken }
    })

    console.log('✅ Correctly detected duplicate claim')
  })
})

// Utility test for API structure validation
test.describe('API Response Structure Validation', () => {

  test('Validate response schemas match North Star patterns', async ({ request }) => {
    // This test validates that our API responses follow the expected structure

    const createResponse = await request.post(`${BASE_URL}/api/v1/expense-claims`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authToken
      },
      data: {
        ...EXPENSE_CLAIM_DATA,
        reference_number: `SCHEMA-TEST-${Date.now()}`
      }
    })

    expect(createResponse.status()).toBe(200)
    const createBody = await createResponse.json()

    // Validate create response structure
    expect(createBody).toHaveProperty('success', true)
    expect(createBody).toHaveProperty('data')
    expect(createBody.data).toHaveProperty('expense_claim')
    expect(createBody.data).toHaveProperty('processing_complete')
    expect(createBody.data).toHaveProperty('message')

    const claimId = createBody.data.expense_claim.id

    // Validate list response structure
    const listResponse = await request.get(`${BASE_URL}/api/v1/expense-claims`, {
      headers: { 'Cookie': authToken }
    })

    const listBody = await listResponse.json()
    expect(listBody).toHaveProperty('success', true)
    expect(listBody).toHaveProperty('data')
    expect(listBody.data).toHaveProperty('claims')
    expect(listBody.data).toHaveProperty('pagination')
    expect(listBody.data.pagination).toHaveProperty('page')
    expect(listBody.data.pagination).toHaveProperty('limit')
    expect(listBody.data.pagination).toHaveProperty('total')
    expect(listBody.data.pagination).toHaveProperty('has_more')
    expect(listBody.data.pagination).toHaveProperty('total_pages')

    // Cleanup
    await request.delete(`${BASE_URL}/api/v1/expense-claims/${claimId}`, {
      headers: { 'Cookie': authToken }
    })

    console.log('✅ API response schemas validated')
  })
})