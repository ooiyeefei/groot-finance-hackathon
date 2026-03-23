/**
 * Tool Type Definitions
 *
 * Types only — no classes, no logic. The BaseTool class has been eliminated.
 * All tool execution now goes through MCP via mcp-tool-registry.ts.
 *
 * This file is kept for backward compatibility with 15+ files that import
 * UserContext, CitationData, ModelType, OpenAIToolSchema from here.
 */

export interface UserContext {
  userId: string
  convexUserId?: string
  businessId?: string
  conversationId?: string
  role?: string
  homeCurrency?: string
}

export interface ToolParameters {
  [key: string]: any
}

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface CitationData {
  id: string
  index: number
  source_name: string
  country: string
  section?: string
  pdf_url?: string
  page_number?: number
  text_coordinates?: BoundingBox
  content_snippet: string
  confidence_score: number
  official_url?: string
}

export interface ToolResult {
  toolName?: string
  success: boolean
  data?: any
  error?: string
  metadata?: Record<string, any>
  citations?: CitationData[]
  executionTime?: number
  debugInfo?: string
  errorType?: string
  timestamp?: string
}

export type ModelType = 'gemini' | 'openai'

export interface OpenAIToolSchema {
  type: "function"
  function: {
    name: string
    description: string
    parameters: {
      type: "object"
      properties: Record<string, any>
      required: string[]
    }
  }
}
