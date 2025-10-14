/**
 * Applications API v1 - E2E Tests
 * Tests for GET /api/v1/applications endpoint
 */

import { test, expect } from '@playwright/test'

test.describe('GET /api/v1/applications', () => {
  // Use test credentials from .env.local
  const TEST_USER = process.env.TEST_USER
  const TEST_USER_PW = process.env.TEST_USER_PW
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3005'

  let authCookie: string

  test.beforeAll(async ({ browser }) => {
    // Authenticate once for all tests
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(`${BASE_URL}/en/sign-in`)

    // Fill in Clerk authentication form
    await page.getByLabel('Email address').fill(TEST_USER!)
    await page.getByLabel('Password').fill(TEST_USER_PW!)
    await page.getByRole('button', { name: 'Continue' }).click()

    // Wait for successful authentication (redirect to home or dashboard)
    await page.waitForURL(/\/(en|th|id|zh)\//)

    // Extract auth cookie
    const cookies = await context.cookies()
    const clerkSession = cookies.find(c => c.name.startsWith('__session'))
    if (clerkSession) {
      authCookie = `${clerkSession.name}=${clerkSession.value}`
    }

    await context.close()
  })

  test('should successfully fetch a list of applications', async ({ request }) => {
    // Make authenticated API request
    const response = await request.get(`${BASE_URL}/api/v1/applications`, {
      headers: {
        Cookie: authCookie
      }
    })

    // Assert response status
    expect(response.status()).toBe(200)

    // Parse response body
    const body = await response.json()

    // Assert response structure
    expect(body).toHaveProperty('success', true)
    expect(body).toHaveProperty('data')
    expect(body.data).toHaveProperty('applications')
    expect(body.data).toHaveProperty('pagination')

    // Validate applications array
    expect(Array.isArray(body.data.applications)).toBe(true)

    // If applications exist, validate structure
    if (body.data.applications.length > 0) {
      const firstApp = body.data.applications[0]

      // Assert core properties exist
      expect(firstApp).toHaveProperty('id')
      expect(firstApp).toHaveProperty('title')
      expect(firstApp).toHaveProperty('status')
      expect(firstApp).toHaveProperty('progress_percentage')
      expect(firstApp).toHaveProperty('slot_status')
      expect(firstApp).toHaveProperty('slots_total')
      expect(firstApp).toHaveProperty('slots_filled')

      // Validate types
      expect(typeof firstApp.id).toBe('string')
      expect(typeof firstApp.title).toBe('string')
      expect(typeof firstApp.status).toBe('string')
      expect(typeof firstApp.progress_percentage).toBe('number')
      expect(Array.isArray(firstApp.slot_status)).toBe(true)
    }

    // Validate pagination metadata
    expect(body.data.pagination).toHaveProperty('page')
    expect(body.data.pagination).toHaveProperty('limit')
    expect(body.data.pagination).toHaveProperty('total')
    expect(body.data.pagination).toHaveProperty('has_more')
    expect(body.data.pagination).toHaveProperty('total_pages')

    console.log(`✅ Found ${body.data.applications.length} applications`)
    console.log(`✅ Total count: ${body.data.pagination.total}`)
  })

  test('should support pagination parameters', async ({ request }) => {
    // Test with page=1, limit=5
    const response = await request.get(`${BASE_URL}/api/v1/applications?page=1&limit=5`, {
      headers: {
        Cookie: authCookie
      }
    })

    expect(response.status()).toBe(200)

    const body = await response.json()

    // Assert pagination reflects requested parameters
    expect(body.data.pagination.page).toBe(1)
    expect(body.data.pagination.limit).toBe(5)
    expect(body.data.applications.length).toBeLessThanOrEqual(5)

    console.log(`✅ Pagination working: page=${body.data.pagination.page}, limit=${body.data.pagination.limit}`)
  })

  test('should support status filtering', async ({ request }) => {
    // Test filtering by status=draft
    const response = await request.get(`${BASE_URL}/api/v1/applications?status=draft`, {
      headers: {
        Cookie: authCookie
      }
    })

    expect(response.status()).toBe(200)

    const body = await response.json()

    // If applications exist, verify all have status=draft
    if (body.data.applications.length > 0) {
      body.data.applications.forEach((app: any) => {
        expect(app.status).toBe('draft')
      })
    }

    console.log(`✅ Status filter working: found ${body.data.applications.length} draft applications`)
  })

  test('should return 401 when unauthenticated', async ({ request }) => {
    // Make request without auth cookie
    const response = await request.get(`${BASE_URL}/api/v1/applications`)

    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body).toHaveProperty('success', false)
    expect(body).toHaveProperty('error', 'Unauthorized')

    console.log(`✅ Unauthorized access correctly blocked`)
  })

  test('should validate invalid pagination parameters', async ({ request }) => {
    // Test with invalid page parameter
    const response = await request.get(`${BASE_URL}/api/v1/applications?page=invalid`, {
      headers: {
        Cookie: authCookie
      }
    })

    // Should return 400 for invalid parameters
    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('success', false)
    expect(body).toHaveProperty('error', 'Invalid query parameters')

    console.log(`✅ Invalid parameters correctly rejected`)
  })

  test('should return correct slot status for applications', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/applications`, {
      headers: {
        Cookie: authCookie
      }
    })

    expect(response.status()).toBe(200)

    const body = await response.json()

    // If applications exist, validate slot_status structure
    if (body.data.applications.length > 0) {
      const app = body.data.applications[0]

      expect(Array.isArray(app.slot_status)).toBe(true)

      if (app.slot_status.length > 0) {
        const slot = app.slot_status[0]

        // Validate slot structure
        expect(slot).toHaveProperty('slot')
        expect(slot).toHaveProperty('display_name')
        expect(slot).toHaveProperty('is_critical')
        expect(slot).toHaveProperty('status')

        console.log(`✅ Slot status structure validated for application ${app.id}`)
      }
    }
  })
})

test.describe('POST /api/v1/applications', () => {
  const TEST_USER = process.env.TEST_USER
  const TEST_USER_PW = process.env.TEST_USER_PW
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3005'

  let authCookie: string

  test.beforeAll(async ({ browser }) => {
    // Authenticate once for all tests
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(`${BASE_URL}/en/sign-in`)

    // Fill in Clerk authentication form
    await page.getByLabel('Email address').fill(TEST_USER!)
    await page.getByLabel('Password').fill(TEST_USER_PW!)
    await page.getByRole('button', { name: 'Continue' }).click()

    // Wait for successful authentication
    await page.waitForURL(/\/(en|th|id|zh)\//)

    // Extract auth cookie
    const cookies = await context.cookies()
    const clerkSession = cookies.find(c => c.name.startsWith('__session'))
    if (clerkSession) {
      authCookie = `${clerkSession.name}=${clerkSession.value}`
    }

    await context.close()
  })

  test('should successfully create a new application', async ({ request }) => {
    // Prepare test data
    const testApplication = {
      title: 'Playwright Test Application',
      description: 'Created by Playwright E2E test',
      application_type: 'personal_loan'
    }

    // Make authenticated POST request
    const response = await request.post(`${BASE_URL}/api/v1/applications`, {
      headers: {
        Cookie: authCookie,
        'Content-Type': 'application/json'
      },
      data: testApplication
    })

    // Assert response status is 201 Created
    expect(response.status()).toBe(201)

    // Parse response body
    const body = await response.json()

    // Assert response structure
    expect(body).toHaveProperty('success', true)
    expect(body).toHaveProperty('data')

    // Assert application properties
    const createdApp = body.data
    expect(createdApp).toHaveProperty('id')
    expect(createdApp).toHaveProperty('title', testApplication.title)
    expect(createdApp).toHaveProperty('description', testApplication.description)
    expect(createdApp).toHaveProperty('application_type', testApplication.application_type)
    expect(createdApp).toHaveProperty('status', 'draft')
    expect(createdApp).toHaveProperty('slots_filled', 0)
    expect(createdApp).toHaveProperty('slots_total')
    expect(createdApp).toHaveProperty('progress_percentage', 0)

    // Assert application_types join
    expect(createdApp).toHaveProperty('application_types')
    expect(createdApp.application_types).toHaveProperty('type_code', 'personal_loan')
    expect(createdApp.application_types).toHaveProperty('display_name')
    expect(createdApp.application_types).toHaveProperty('required_documents')

    console.log(`✅ Created application: ${createdApp.id} with title "${createdApp.title}"`)

    // Cleanup: Delete the test application
    const deleteResponse = await request.delete(`${BASE_URL}/api/applications/${createdApp.id}`, {
      headers: {
        Cookie: authCookie
      }
    })

    if (deleteResponse.ok()) {
      console.log(`✅ Cleaned up test application: ${createdApp.id}`)
    }
  })

  test('should return 400 for invalid request body', async ({ request }) => {
    // Send request with missing required field (title)
    const invalidData = {
      description: 'Missing title field'
    }

    const response = await request.post(`${BASE_URL}/api/v1/applications`, {
      headers: {
        Cookie: authCookie,
        'Content-Type': 'application/json'
      },
      data: invalidData
    })

    // Assert response status is 400 Bad Request
    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('success', false)
    expect(body).toHaveProperty('error', 'Invalid request body')
    expect(body).toHaveProperty('details')

    console.log(`✅ Invalid request correctly rejected with 400`)
  })

  test('should return 401 when unauthenticated', async ({ request }) => {
    // Make request without auth cookie
    const testApplication = {
      title: 'Unauthorized Test',
      application_type: 'personal_loan'
    }

    const response = await request.post(`${BASE_URL}/api/v1/applications`, {
      headers: {
        'Content-Type': 'application/json'
      },
      data: testApplication
    })

    // Assert response status is 401 Unauthorized
    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body).toHaveProperty('success', false)
    expect(body).toHaveProperty('error', 'Unauthorized')

    console.log(`✅ Unauthorized access correctly blocked`)
  })

  test('should validate application_type field', async ({ request }) => {
    // Send request with invalid application_type
    const invalidTypeData = {
      title: 'Test Application',
      application_type: 'invalid_type_that_does_not_exist'
    }

    const response = await request.post(`${BASE_URL}/api/v1/applications`, {
      headers: {
        Cookie: authCookie,
        'Content-Type': 'application/json'
      },
      data: invalidTypeData
    })

    // Assert response status is 400 Bad Request
    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('success', false)
    expect(body.error).toContain('Invalid application type')

    console.log(`✅ Invalid application type correctly rejected`)
  })
})
