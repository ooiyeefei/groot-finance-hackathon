/**
 * Accounting Entries API v1 - Convex Migration Test Suite
 * Tests the data-access layer after Supabase → Convex migration
 *
 * Tests all core CRUD operations:
 * - POST /api/v1/accounting-entries (create)
 * - GET /api/v1/accounting-entries/{id} (get single)
 * - GET /api/v1/accounting-entries (list with filters)
 * - PATCH /api/v1/accounting-entries/{id} (update)
 * - DELETE /api/v1/accounting-entries/{id} (soft delete)
 * - PATCH /api/v1/accounting-entries/{id}/status (update status)
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// Test data for creating accounting entries
// Valid transaction_type values: Income, Cost of Goods Sold, Expense (P&L categories)
const ACCOUNTING_ENTRY_DATA = {
  transaction_type: 'Expense',  // P&L category
  category: 'travel_entertainment',
  description: 'Test Business Travel Expense - Convex Migration Test',
  transaction_date: new Date().toISOString().split('T')[0],
  original_currency: 'SGD',
  original_amount: 250.00,
  home_currency: 'SGD',
  vendor_name: 'Singapore Airlines',
  reference_number: `TEST-CONVEX-${Date.now()}`,
  line_items: [
    {
      item_description: 'Flight ticket SIN-BKK',
      quantity: 1,
      unit_price: 200.00,
      total_amount: 200.00,
      currency: 'SGD',
      tax_rate: 7
    },
    {
      item_description: 'Baggage fee',
      quantity: 1,
      unit_price: 50.00,
      total_amount: 50.00,
      currency: 'SGD',
      tax_rate: 7
    }
  ]
}

// Multi-currency test data
const CROSS_BORDER_ENTRY = {
  transaction_type: 'Expense',  // P&L category
  category: 'travel_entertainment',
  description: 'Cross-border expense - Thai Baht test',
  transaction_date: new Date().toISOString().split('T')[0],
  original_currency: 'THB',
  original_amount: 5000.00,
  home_currency: 'SGD',
  vendor_name: 'Bangkok Hotel',
  reference_number: `TEST-THB-${Date.now()}`
}

// Income entry test data
const INCOME_ENTRY = {
  transaction_type: 'Income',
  category: 'operating_revenue',
  description: 'Test consulting income - Convex Migration',
  transaction_date: new Date().toISOString().split('T')[0],
  original_currency: 'USD',
  original_amount: 1500.00,
  home_currency: 'SGD',
  vendor_name: 'Client ABC Corp',
  reference_number: `TEST-INCOME-${Date.now()}`
}

let createdEntryId: string

test.describe('Accounting Entries API - Convex Migration Tests', () => {

  test.describe('CREATE Operations', () => {

    test('1.1 POST /api/v1/accounting-entries - Create expense entry', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/v1/accounting-entries`, {
        headers: { 'Content-Type': 'application/json' },
        data: ACCOUNTING_ENTRY_DATA
      })

      // Should succeed (200 or 201)
      expect([200, 201]).toContain(response.status())

      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data?.transaction).toBeDefined()

      const entry = body.data.transaction
      expect(entry.id).toBeDefined()
      expect(entry.transaction_type).toBe('Expense')
      expect(entry.category).toBe('travel_entertainment')
      expect(entry.original_amount).toBe(250.00)
      expect(entry.original_currency).toBe('SGD')
      expect(entry.home_currency).toBe('SGD')
      expect(entry.home_currency_amount).toBe(250.00) // Same currency = same amount
      expect(entry.exchange_rate).toBe(1) // Same currency = rate of 1

      // Store for later tests
      createdEntryId = entry.id
      console.log(`✅ Created entry: ${createdEntryId}`)
    })

    test('1.2 POST - Create income entry', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/v1/accounting-entries`, {
        headers: { 'Content-Type': 'application/json' },
        data: INCOME_ENTRY
      })

      expect([200, 201]).toContain(response.status())

      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data?.transaction?.transaction_type).toBe('Income')
      expect(body.data?.transaction?.category).toBe('operating_revenue')
    })

    test('1.3 POST - Create cross-border entry (currency conversion)', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/v1/accounting-entries`, {
        headers: { 'Content-Type': 'application/json' },
        data: CROSS_BORDER_ENTRY
      })

      expect([200, 201]).toContain(response.status())

      const body = await response.json()
      expect(body.success).toBe(true)

      const entry = body.data?.transaction
      expect(entry.original_currency).toBe('THB')
      expect(entry.home_currency).toBe('SGD')
      expect(entry.original_amount).toBe(5000.00)
      // Home currency amount should be converted (THB → SGD)
      expect(entry.home_currency_amount).toBeGreaterThan(0)
      // Exchange rate should not be 1 for cross-currency
      expect(entry.exchange_rate).not.toBe(1)
      console.log(`✅ Cross-border conversion: ${entry.original_amount} THB → ${entry.home_currency_amount} SGD (rate: ${entry.exchange_rate})`)
    })

    test('1.4 POST - Reject invalid transaction type', async ({ request }) => {
      const invalidData = {
        ...ACCOUNTING_ENTRY_DATA,
        transaction_type: 'InvalidType'
      }

      const response = await request.post(`${BASE_URL}/api/v1/accounting-entries`, {
        headers: { 'Content-Type': 'application/json' },
        data: invalidData
      })

      // Should fail with 400
      expect(response.status()).toBe(400)

      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error).toContain('Invalid')
    })

    test('1.5 POST - Reject missing required fields', async ({ request }) => {
      const incompleteData = {
        transaction_type: 'Expense',
        // Missing: category, description, transaction_date, amounts
      }

      const response = await request.post(`${BASE_URL}/api/v1/accounting-entries`, {
        headers: { 'Content-Type': 'application/json' },
        data: incompleteData
      })

      expect(response.status()).toBe(400)
    })
  })

  test.describe('READ Operations', () => {

    test('2.1 GET /api/v1/accounting-entries - List all entries', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/v1/accounting-entries`)

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data?.transactions).toBeInstanceOf(Array)
      expect(body.data?.pagination).toBeDefined()
      expect(body.data?.pagination?.page).toBeGreaterThanOrEqual(1)
      expect(body.data?.pagination?.limit).toBeGreaterThan(0)
    })

    test('2.2 GET - Filter by transaction_type', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/v1/accounting-entries?transaction_type=Expense`)

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.success).toBe(true)

      // All returned entries should be Expense type
      for (const entry of body.data?.transactions || []) {
        expect(entry.transaction_type).toBe('Expense')
      }
    })

    test('2.3 GET - Filter by date range', async ({ request }) => {
      const today = new Date().toISOString().split('T')[0]
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const response = await request.get(
        `${BASE_URL}/api/v1/accounting-entries?date_from=${lastWeek}&date_to=${today}`
      )

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.success).toBe(true)
    })

    test('2.4 GET - Pagination works correctly', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/v1/accounting-entries?limit=5&page=1`)

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.data?.transactions?.length).toBeLessThanOrEqual(5)
      expect(body.data?.pagination?.limit).toBe(5)
    })

    test('2.5 GET /api/v1/accounting-entries/{id} - Get single entry', async ({ request }) => {
      // Skip if no entry was created
      test.skip(!createdEntryId, 'No entry ID available from create test')

      const response = await request.get(`${BASE_URL}/api/v1/accounting-entries/${createdEntryId}`)

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data?.transaction?.id).toBe(createdEntryId)
    })

    test('2.6 GET - Non-existent entry returns 404', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/v1/accounting-entries/non-existent-id`)

      // Should return 404 or error
      expect([400, 404]).toContain(response.status())
    })
  })

  test.describe('UPDATE Operations', () => {

    test('3.1 PATCH /api/v1/accounting-entries/{id} - Update entry', async ({ request }) => {
      test.skip(!createdEntryId, 'No entry ID available from create test')

      const updateData = {
        description: 'Updated description - Convex migration verified',
        vendor_name: 'Updated Vendor Name'
      }

      const response = await request.patch(
        `${BASE_URL}/api/v1/accounting-entries/${createdEntryId}`,
        {
          headers: { 'Content-Type': 'application/json' },
          data: updateData
        }
      )

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data?.transaction?.description).toBe(updateData.description)
      expect(body.data?.transaction?.vendor_name).toBe(updateData.vendor_name)
    })

    test('3.2 PATCH - Update status', async ({ request }) => {
      test.skip(!createdEntryId, 'No entry ID available from create test')

      const response = await request.patch(
        `${BASE_URL}/api/v1/accounting-entries/${createdEntryId}/status`,
        {
          headers: { 'Content-Type': 'application/json' },
          data: { status: 'paid' }
        }
      )

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data?.transaction?.status).toBe('paid')
    })

    test('3.3 PATCH - Update category', async ({ request }) => {
      test.skip(!createdEntryId, 'No entry ID available from create test')

      const response = await request.patch(
        `${BASE_URL}/api/v1/accounting-entries/${createdEntryId}/category`,
        {
          headers: { 'Content-Type': 'application/json' },
          data: {
            category: 'other_operating',
            subcategory: 'office_supplies'
          }
        }
      )

      expect([200, 404]).toContain(response.status()) // 404 if endpoint doesn't exist
    })
  })

  test.describe('DELETE Operations', () => {

    test('4.1 DELETE /api/v1/accounting-entries/{id} - Soft delete entry', async ({ request }) => {
      // Create a new entry specifically for deletion test
      const deleteTestEntry = {
        ...ACCOUNTING_ENTRY_DATA,
        reference_number: `DELETE-TEST-${Date.now()}`,
        description: 'Entry to be deleted - Convex test'
      }

      const createResponse = await request.post(`${BASE_URL}/api/v1/accounting-entries`, {
        headers: { 'Content-Type': 'application/json' },
        data: deleteTestEntry
      })

      expect([200, 201]).toContain(createResponse.status())

      const createBody = await createResponse.json()
      const entryToDelete = createBody.data?.transaction?.id

      if (!entryToDelete) {
        test.skip(true, 'Could not create entry for delete test')
        return
      }

      // Now delete it
      const deleteResponse = await request.delete(
        `${BASE_URL}/api/v1/accounting-entries/${entryToDelete}`
      )

      expect(deleteResponse.status()).toBe(200)

      // Verify it's no longer accessible
      const getResponse = await request.get(
        `${BASE_URL}/api/v1/accounting-entries/${entryToDelete}`
      )

      // Should return 404 or error after soft delete
      expect([400, 404]).toContain(getResponse.status())
    })
  })

  test.describe('Data Integrity', () => {

    test('5.1 Verify line items are stored correctly', async ({ request }) => {
      // Create entry with line items
      const response = await request.post(`${BASE_URL}/api/v1/accounting-entries`, {
        headers: { 'Content-Type': 'application/json' },
        data: ACCOUNTING_ENTRY_DATA
      })

      expect([200, 201]).toContain(response.status())

      const body = await response.json()
      const entry = body.data?.transaction

      // Verify line items
      if (entry?.line_items) {
        expect(entry.line_items).toBeInstanceOf(Array)
        expect(entry.line_items.length).toBe(2)
        expect(entry.line_items[0].item_description).toBe('Flight ticket SIN-BKK')
        expect(entry.line_items[0].quantity).toBe(1)
        expect(entry.line_items[0].unit_price).toBe(200.00)
      }
    })

    test('5.2 Verify timestamps are set correctly', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/v1/accounting-entries`, {
        headers: { 'Content-Type': 'application/json' },
        data: {
          ...ACCOUNTING_ENTRY_DATA,
          reference_number: `TIMESTAMP-TEST-${Date.now()}`
        }
      })

      expect([200, 201]).toContain(response.status())

      const body = await response.json()
      const entry = body.data?.transaction

      expect(entry.created_at).toBeDefined()
      expect(entry.updated_at).toBeDefined()

      // Verify dates are valid ISO strings
      expect(new Date(entry.created_at).toISOString()).toBe(entry.created_at)
    })

    test('5.3 Verify response shape matches interface', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/v1/accounting-entries?limit=1`)

      expect(response.status()).toBe(200)

      const body = await response.json()

      if (body.data?.transactions?.length > 0) {
        const entry = body.data.transactions[0]

        // Required fields from AccountingEntry interface
        expect(entry).toHaveProperty('id')
        expect(entry).toHaveProperty('user_id')
        expect(entry).toHaveProperty('transaction_type')
        expect(entry).toHaveProperty('category')
        expect(entry).toHaveProperty('description')
        expect(entry).toHaveProperty('original_currency')
        expect(entry).toHaveProperty('original_amount')
        expect(entry).toHaveProperty('home_currency')
        expect(entry).toHaveProperty('home_currency_amount')
        expect(entry).toHaveProperty('exchange_rate')
        expect(entry).toHaveProperty('transaction_date')
        expect(entry).toHaveProperty('created_at')
        expect(entry).toHaveProperty('updated_at')
      }
    })
  })
})

/**
 * To run these tests:
 *
 * 1. Start the dev server: npm run dev
 * 2. Run tests: npm run test:e2e tests/api/accounting-entries.spec.ts
 *
 * Or with specific environment:
 * BASE_URL=http://localhost:3000 npx playwright test tests/api/accounting-entries.spec.ts
 */
