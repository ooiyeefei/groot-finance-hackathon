/**
 * Mem0 Connection Test Script (T013)
 *
 * Tests Mem0 OSS integration with:
 * - Configuration health check
 * - Memory add/search/get/delete operations
 *
 * Run: npx ts-node --esm src/lib/ai/agent/memory/mem0-test.ts
 * Or: npm run test:mem0 (if script added to package.json)
 *
 * Prerequisites:
 * - Neo4j Aura credentials configured (NEO4J_URL, NEO4J_USERNAME, NEO4J_PASSWORD)
 * - Qdrant Cloud configured (QDRANT_URL, QDRANT_API_KEY)
 * - Gemini API key configured (GEMINI_API_KEY)
 */

import { mem0Service, type Memory } from './mem0-service'
import { checkMem0ConfigHealth } from './mem0-config'

// Test user context
const TEST_USER_ID = 'test-user-001'
const TEST_BUSINESS_ID = 'test-business-001'

interface TestResult {
  name: string
  passed: boolean
  message: string
  duration: number
}

const results: TestResult[] = []

async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<void> {
  const start = Date.now()
  try {
    await testFn()
    results.push({
      name,
      passed: true,
      message: 'Passed',
      duration: Date.now() - start
    })
    console.log(`✅ ${name} (${Date.now() - start}ms)`)
  } catch (error) {
    results.push({
      name,
      passed: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - start
    })
    console.log(`❌ ${name}: ${error instanceof Error ? error.message : error}`)
  }
}

async function testConfigHealth(): Promise<void> {
  const health = checkMem0ConfigHealth()
  console.log('\n📋 Configuration Health Check:')
  console.log(`   Available: ${health.available}`)
  console.log(`   Mode: ${health.mode}`)
  if (health.issues.length > 0) {
    console.log(`   Issues: ${health.issues.join(', ')}`)
  }

  if (!health.available) {
    throw new Error(`Configuration incomplete: ${health.issues.join(', ')}`)
  }
}

async function testServiceAvailability(): Promise<void> {
  const available = await mem0Service.isAvailable()
  if (!available) {
    const error = mem0Service.getInitError()
    throw new Error(`Service not available: ${error}`)
  }
}

async function testAddMemory(): Promise<string | null> {
  const messages = [
    { role: 'user' as const, content: 'My preferred currency is Malaysian Ringgit (MYR).' },
    { role: 'assistant' as const, content: 'Got it! I\'ll remember that your preferred currency is MYR.' },
    { role: 'user' as const, content: 'I usually categorize office supplies under Operations.' },
    { role: 'assistant' as const, content: 'Noted! Office supplies will be categorized under Operations.' }
  ]

  const result = await mem0Service.addConversationMemories(
    messages,
    TEST_USER_ID,
    TEST_BUSINESS_ID,
    { test: true, timestamp: new Date().toISOString() }
  )

  if (!result) {
    throw new Error('addConversationMemories returned null')
  }

  console.log(`   Added ${result.results?.length || 0} memories`)

  // Return first memory ID for subsequent tests
  return result.results?.[0]?.id || null
}

async function testSearchMemories(): Promise<void> {
  const memories = await mem0Service.searchMemories(
    'currency preference',
    TEST_USER_ID,
    TEST_BUSINESS_ID,
    5
  )

  console.log(`   Found ${memories.length} memories`)

  if (memories.length === 0) {
    console.log('   ⚠️  No memories found (may take time to index)')
  } else {
    memories.forEach((mem, i) => {
      console.log(`   ${i + 1}. ${mem.memory.substring(0, 60)}...`)
    })
  }
}

async function testGetAllMemories(): Promise<Memory[]> {
  const memories = await mem0Service.getAllUserMemories(
    TEST_USER_ID,
    TEST_BUSINESS_ID
  )

  console.log(`   Retrieved ${memories.length} total memories`)
  return memories
}

async function testGetMemory(memoryId: string): Promise<void> {
  const memory = await mem0Service.getMemory(memoryId)

  if (!memory) {
    throw new Error(`Memory ${memoryId} not found`)
  }

  console.log(`   Memory content: ${memory.memory.substring(0, 60)}...`)
}

async function testDeleteMemory(memoryId: string): Promise<void> {
  const deleted = await mem0Service.deleteMemory(memoryId)

  if (!deleted) {
    throw new Error(`Failed to delete memory ${memoryId}`)
  }

  console.log(`   Successfully deleted memory ${memoryId}`)
}

async function cleanupTestMemories(): Promise<void> {
  console.log('\n🧹 Cleaning up test memories...')
  const memories = await mem0Service.getAllUserMemories(
    TEST_USER_ID,
    TEST_BUSINESS_ID
  )

  for (const memory of memories) {
    await mem0Service.deleteMemory(memory.id)
  }

  console.log(`   Cleaned up ${memories.length} test memories`)
}

async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('🧪 Mem0 Connection Test Suite')
  console.log('='.repeat(60))

  // Test 1: Configuration Health
  await runTest('Configuration Health Check', testConfigHealth)

  // Early exit if config is not healthy
  const health = checkMem0ConfigHealth()
  if (!health.available) {
    console.log('\n⚠️  Skipping remaining tests - configuration incomplete')
    console.log('   Please ensure Neo4j, Qdrant, and Gemini are configured.')
    printSummary()
    return
  }

  // Test 2: Service Availability
  await runTest('Service Availability', testServiceAvailability)

  // Early exit if service not available
  const available = await mem0Service.isAvailable()
  if (!available) {
    console.log('\n⚠️  Skipping memory operations - service not available')
    printSummary()
    return
  }

  // Test 3: Add Memory
  let memoryId: string | null = null
  await runTest('Add Conversation Memories', async () => {
    memoryId = await testAddMemory()
  })

  // Small delay to allow indexing
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Test 4: Search Memories
  await runTest('Search Memories', testSearchMemories)

  // Test 5: Get All Memories
  await runTest('Get All User Memories', async () => {
    await testGetAllMemories()
  })

  // Test 6: Get Specific Memory (if we have one)
  if (memoryId) {
    await runTest('Get Specific Memory', async () => {
      await testGetMemory(memoryId!)
    })

    // Test 7: Delete Memory
    await runTest('Delete Memory', async () => {
      await testDeleteMemory(memoryId!)
    })
  }

  // Cleanup
  await cleanupTestMemories()

  printSummary()
}

function printSummary(): void {
  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Summary')
  console.log('='.repeat(60))

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌'
    console.log(`${icon} ${r.name}: ${r.message} (${r.duration}ms)`)
  })

  console.log('-'.repeat(60))
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`)

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check configuration and try again.')
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed! Mem0 integration is working correctly.')
    process.exit(0)
  }
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
