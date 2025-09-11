#!/usr/bin/env node

/**
 * Test script for clarification response detection
 * Tests the business setup → clarification → response flow
 */

const fetch = require('node-fetch')

const API_BASE = 'http://localhost:3001'
const TEST_USER_ID = 'test-user-123'

async function testClarificationFlow() {
  console.log('🧪 Testing Clarification Response Detection Flow\n')

  try {
    // Step 1: Initial business setup query (should trigger clarification)
    console.log('Step 1: Initial business setup query...')
    const firstResponse = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user-id': TEST_USER_ID
      },
      body: JSON.stringify({
        message: "I want to set up a business",
        language: "en"
      })
    })

    const firstResult = await firstResponse.json()
    console.log('✅ First response:', {
      conversationId: firstResult.conversationId,
      needsClarification: firstResult.needsClarification,
      clarificationQuestions: firstResult.clarificationQuestions?.length || 0,
      responsePreview: firstResult.message?.substring(0, 100) + '...'
    })

    if (!firstResult.conversationId) {
      throw new Error('No conversation ID returned')
    }

    // Step 2: Clarification response (should continue business setup context)
    console.log('\nStep 2: Clarification response...')
    const secondResponse = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user-id': TEST_USER_ID
      },
      body: JSON.stringify({
        message: "Sole Proprietorship",
        conversationId: firstResult.conversationId,
        language: "en"
      })
    })

    const secondResult = await secondResponse.json()
    console.log('✅ Second response:', {
      conversationId: secondResult.conversationId,
      needsClarification: secondResult.needsClarification,
      clarificationQuestions: secondResult.clarificationQuestions?.length || 0,
      responsePreview: secondResult.message?.substring(0, 100) + '...'
    })

    // Step 3: Another clarification response 
    console.log('\nStep 3: Country clarification response...')
    const thirdResponse = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user-id': TEST_USER_ID
      },
      body: JSON.stringify({
        message: "Singapore",
        conversationId: firstResult.conversationId,
        language: "en"
      })
    })

    const thirdResult = await thirdResponse.json()
    console.log('✅ Third response:', {
      conversationId: thirdResult.conversationId,
      needsClarification: thirdResult.needsClarification,
      clarificationQuestions: thirdResult.clarificationQuestions?.length || 0,
      responsePreview: thirdResult.message?.substring(0, 100) + '...'
    })

    console.log('\n✅ Test completed successfully!')
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    if (error.response) {
      const errorText = await error.response.text()
      console.error('Response body:', errorText)
    }
  }
}

testClarificationFlow()