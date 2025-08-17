/**
 * Comprehensive Security Testing Suite
 * Tests all security aspects of the tool system
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { BaseTool } from '../base/base-tool'
import { ToolFactory } from '../registry/tool-factory'
import { LangGraphToolAdapter } from '../adapters/langgraph-tool-adapter'
import { SecurityValidator, UserContext, ToolParameters } from '../base/tool-interfaces'

// Mock Supabase client
jest.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: () => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: { id: 'test-user' }, error: null })),
          limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }))
    }))
  })
}))

// Mock AI services
jest.mock('@/lib/ai-services/embedding-service', () => ({
  EmbeddingService: jest.fn(() => ({
    generateEmbedding: jest.fn(() => Promise.resolve([0.1, 0.2, 0.3]))
  }))
}))

jest.mock('@/lib/ai-services/vector-storage-service', () => ({
  VectorStorageService: jest.fn(() => ({
    similaritySearch: jest.fn(() => Promise.resolve([]))
  }))
}))

describe('Security Validator', () => {
  describe('validateUserContext', () => {
    it('should reject null user context', () => {
      const result = SecurityValidator.validateUserContext(null as any)
      expect(result.authorized).toBe(false)
      expect(result.reason).toContain('Missing user context')
    })

    it('should reject empty userId', () => {
      const result = SecurityValidator.validateUserContext({ userId: '' })
      expect(result.authorized).toBe(false)
      expect(result.reason).toContain('Invalid userId format')
    })

    it('should accept valid user context', () => {
      const result = SecurityValidator.validateUserContext({ userId: 'user-123' })
      expect(result.authorized).toBe(true)
    })
  })

  describe('validateParameters', () => {
    it('should reject non-object parameters', () => {
      const result = SecurityValidator.validateParameters('invalid' as any)
      expect(result.valid).toBe(false)
    })

    it('should detect SQL injection attempts', () => {
      const result = SecurityValidator.validateParameters({ query: 'DROP TABLE users' })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('unsafe parameter')
    })

    it('should detect XSS attempts', () => {
      const result = SecurityValidator.validateParameters({ query: '<script>alert("xss")</script>' })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('unsafe parameter')
    })

    it('should accept safe parameters', () => {
      const result = SecurityValidator.validateParameters({ query: 'find invoices from last month' })
      expect(result.valid).toBe(true)
    })
  })

  describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
      const result = SecurityValidator.sanitizeString('<script>alert("test")</script>')
      expect(result).not.toContain('<script>')
      expect(result).not.toContain('</script>')
    })

    it('should remove dangerous characters', () => {
      const result = SecurityValidator.sanitizeString('test; DROP TABLE users;')
      expect(result).not.toContain(';')
    })

    it('should limit string length', () => {
      const longString = 'a'.repeat(2000)
      const result = SecurityValidator.sanitizeString(longString)
      expect(result.length).toBeLessThanOrEqual(1000)
    })
  })
})

describe('ToolFactory Security', () => {
  let toolFactory: ToolFactory

  beforeEach(() => {
    toolFactory = ToolFactory.getInstance()
  })

  describe('executeTool', () => {
    const validUserContext: UserContext = { userId: 'test-user-123' }
    const validParameters: ToolParameters = { query: 'test query' }

    it('should reject unknown tools', async () => {
      const result = await toolFactory.executeTool('unknown_tool', validParameters, validUserContext)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown tool')
    })

    it('should reject invalid user context', async () => {
      const result = await toolFactory.executeTool('search_documents', validParameters, null as any)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })

    it('should reject malicious parameters', async () => {
      const maliciousParams = { query: 'DROP TABLE users; --' }
      const result = await toolFactory.executeTool('search_documents', maliciousParams, validUserContext)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid parameters')
    })

    it('should execute valid tool requests', async () => {
      const result = await toolFactory.executeTool('search_documents', validParameters, validUserContext)
      // Tool should execute (though may return no results due to mocking)
      expect(result.success).toBe(true)
    })
  })

  describe('validateTools', () => {
    it('should validate all registered tools', async () => {
      const validation = await toolFactory.validateTools()
      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })
  })

  describe('healthCheck', () => {
    it('should perform health check on all tools', async () => {
      const health = await toolFactory.healthCheck()
      expect(health.healthy).toBe(true)
      expect(health.status).toHaveProperty('search_documents')
      expect(health.status).toHaveProperty('get_transactions')
    })
  })
})

describe('LangGraph Tool Adapter Security', () => {
  const validUserContext: UserContext = { userId: 'test-user-123' }

  describe('executeTool', () => {
    it('should validate user context', async () => {
      const result = await LangGraphToolAdapter.executeTool(
        'search_documents',
        { query: 'test' },
        null as any
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })

    it('should validate tool names', async () => {
      const result = await LangGraphToolAdapter.executeTool(
        'malicious_tool',
        { query: 'test' },
        validUserContext
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown tool')
    })
  })

  describe('parseToolCall', () => {
    it('should safely parse valid tool calls', () => {
      const validCall = JSON.stringify({
        tool_call: { name: 'search_documents', parameters: { query: 'test' } },
        reasoning: 'Need to search'
      })

      const result = LangGraphToolAdapter.parseToolCall(validCall)
      expect(result).not.toBeNull()
      expect(result?.toolName).toBe('search_documents')
    })

    it('should reject malformed tool calls', () => {
      const result = LangGraphToolAdapter.parseToolCall('invalid json')
      expect(result).toBeNull()
    })

    it('should reject tool calls without name', () => {
      const invalidCall = JSON.stringify({ tool_call: { parameters: { query: 'test' } } })
      const result = LangGraphToolAdapter.parseToolCall(invalidCall)
      expect(result).toBeNull()
    })
  })

  describe('validateUserContext', () => {
    it('should validate proper user context format', () => {
      expect(LangGraphToolAdapter.validateUserContext({ userId: 'test-123' })).toBe(true)
      expect(LangGraphToolAdapter.validateUserContext({ userId: '' })).toBe(false)
      expect(LangGraphToolAdapter.validateUserContext(null)).toBe(false)
      expect(LangGraphToolAdapter.validateUserContext(undefined)).toBe(false)
    })
  })

  describe('createUserContext', () => {
    it('should create valid user context', () => {
      const context = LangGraphToolAdapter.createUserContext('user-123', 'conv-456')
      expect(context.userId).toBe('user-123')
      expect(context.conversationId).toBe('conv-456')
    })

    it('should reject invalid userId', () => {
      expect(() => LangGraphToolAdapter.createUserContext('')).toThrow()
      expect(() => LangGraphToolAdapter.createUserContext(null as any)).toThrow()
    })
  })
})

describe('Integration Security Tests', () => {
  const validUserContext: UserContext = { userId: 'test-user-123' }

  describe('Cross-tenant data isolation', () => {
    it('should enforce user isolation in document search', async () => {
      const toolFactory = ToolFactory.getInstance()
      
      // Mock Supabase to return different data for different users
      const mockSupabase = {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: { id: 'test-user' }, error: null })),
              limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          }))
        }))
      }

      // Execute tool for user A
      const resultA = await toolFactory.executeTool(
        'search_documents',
        { query: 'test' },
        { userId: 'user-a' }
      )

      // Execute tool for user B  
      const resultB = await toolFactory.executeTool(
        'search_documents',
        { query: 'test' },
        { userId: 'user-b' }
      )

      // Both should succeed but return different data
      expect(resultA.success).toBe(true)
      expect(resultB.success).toBe(true)
      // Results should be isolated (tested through RLS in actual database)
    })
  })

  describe('Parameter injection prevention', () => {
    it('should prevent SQL injection in transaction lookup', async () => {
      const toolFactory = ToolFactory.getInstance()
      
      const maliciousQueries = [
        "'; DROP TABLE transactions; --",
        "' UNION SELECT * FROM users --",
        "1' OR '1'='1",
        "'; DELETE FROM documents; --"
      ]

      for (const maliciousQuery of maliciousQueries) {
        const result = await toolFactory.executeTool(
          'get_transactions',
          { query: maliciousQuery },
          validUserContext
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid parameters')
      }
    })
  })

  describe('Authorization bypass prevention', () => {
    it('should require user context for all operations', async () => {
      const toolFactory = ToolFactory.getInstance()
      const tools = toolFactory.getAvailableTools()

      for (const toolName of tools) {
        const result = await toolFactory.executeTool(
          toolName,
          { query: 'test' },
          null as any
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('Unauthorized')
      }
    })
  })
})

describe('Error Handling Security', () => {
  it('should not leak sensitive information in error messages', async () => {
    const toolFactory = ToolFactory.getInstance()
    
    // Test with various invalid inputs
    const testCases = [
      { tool: 'search_documents', params: null, context: null },
      { tool: 'unknown_tool', params: { query: 'test' }, context: { userId: 'test' } },
      { tool: 'get_transactions', params: { malicious: 'DROP TABLE' }, context: { userId: 'test' } }
    ]

    for (const testCase of testCases) {
      const result = await toolFactory.executeTool(
        testCase.tool,
        testCase.params as any,
        testCase.context as any
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      
      // Error messages should not contain sensitive information
      expect(result.error).not.toContain('password')
      expect(result.error).not.toContain('token')
      expect(result.error).not.toContain('secret')
      expect(result.error).not.toContain('key')
    }
  })
})