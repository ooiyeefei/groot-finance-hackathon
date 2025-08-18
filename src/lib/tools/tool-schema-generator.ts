/**
 * Tool Schema Generator for OpenAI Function Calling
 * Converts FinanSEAL tools to OpenAI function calling format
 */

import { ToolFactory } from './tool-factory'

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

/**
 * Generate OpenAI-compatible tool schemas for all registered tools
 */
export function generateToolSchemas(): OpenAIToolSchema[] {
  return [
    {
      type: "function",
      function: {
        name: "search_documents",
        description: "Search uploaded financial documents (invoices, receipts, reports) using semantic similarity. Use this when users ask about their specific financial documents, invoices, receipts, or want to find documents with specific content.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to find relevant documents. Include relevant keywords like vendor names, amounts, dates, or document types."
            },
            limit: {
              type: "integer",
              description: "Maximum number of results to return (1-20, default: 5)",
              minimum: 1,
              maximum: 20
            },
            similarityThreshold: {
              type: "number",
              description: "Similarity threshold for matching (0-1, default: 0.7)",
              minimum: 0,
              maximum: 1
            }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_transactions",
        description: "Lookup and analyze financial transactions with filtering options. Use this when users ask about their transactions, expenses, spending patterns, or financial summaries.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Query to filter transactions by description, category, or other attributes"
            },
            startDate: {
              type: "string",
              description: "Start date for filtering transactions (YYYY-MM-DD format)"
            },
            endDate: {
              type: "string",
              description: "End date for filtering transactions (YYYY-MM-DD format)"
            },
            category: {
              type: "string",
              description: "Filter by transaction category"
            },
            minAmount: {
              type: "number",
              description: "Minimum transaction amount"
            },
            maxAmount: {
              type: "number",
              description: "Maximum transaction amount"
            },
            limit: {
              type: "integer",
              description: "Maximum number of results to return (default: 10)",
              minimum: 1,
              maximum: 100
            }
          },
          required: []
        }
      }
    }
  ]
}