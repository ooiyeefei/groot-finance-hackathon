/**
 * MCP Protocol Contracts: JSON-RPC 2.0 Message Types
 *
 * This file defines the protocol-level types for MCP communication
 * between the LangGraph client and the Lambda MCP server.
 */

import { z } from 'zod';

// ============================================================================
// JSON-RPC 2.0 Base Types
// ============================================================================

export const JsonRpcVersionSchema = z.literal('2.0');

export const JsonRpcIdSchema = z.union([z.string(), z.number()]);
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;

// ============================================================================
// MCP Request Types
// ============================================================================

export const MCPMethodSchema = z.enum([
  'initialize',
  'tools/list',
  'tools/call',
  'notifications/initialized'
]);

export type MCPMethod = z.infer<typeof MCPMethodSchema>;

// Initialize request
export const InitializeRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  method: z.literal('initialize'),
  params: z.object({
    protocolVersion: z.string(),
    capabilities: z.object({
      roots: z.object({
        listChanged: z.boolean().optional()
      }).optional(),
      sampling: z.object({}).optional()
    }),
    clientInfo: z.object({
      name: z.string(),
      version: z.string()
    })
  })
});

export type InitializeRequest = z.infer<typeof InitializeRequestSchema>;

// Tools list request
export const ToolsListRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  method: z.literal('tools/list'),
  params: z.object({}).optional()
});

export type ToolsListRequest = z.infer<typeof ToolsListRequestSchema>;

// Tools call request
export const ToolsCallRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional()
  })
});

export type ToolsCallRequest = z.infer<typeof ToolsCallRequestSchema>;

// Union of all request types
export const MCPRequestSchema = z.discriminatedUnion('method', [
  InitializeRequestSchema,
  ToolsListRequestSchema,
  ToolsCallRequestSchema
]);

export type MCPRequest = z.infer<typeof MCPRequestSchema>;

// ============================================================================
// MCP Response Types
// ============================================================================

// Tool content block
export const ToolContentSchema = z.object({
  type: z.literal('text'),
  text: z.string()
});

export type ToolContent = z.infer<typeof ToolContentSchema>;

// Tool result
export const ToolResultSchema = z.object({
  content: z.array(ToolContentSchema),
  isError: z.boolean().optional()
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

// Initialize response
export const InitializeResultSchema = z.object({
  protocolVersion: z.string(),
  capabilities: z.object({
    tools: z.object({
      listChanged: z.boolean().optional()
    }).optional(),
    resources: z.object({}).optional(),
    prompts: z.object({}).optional()
  }),
  serverInfo: z.object({
    name: z.string(),
    version: z.string()
  })
});

export type InitializeResult = z.infer<typeof InitializeResultSchema>;

// Tool definition (for tools/list response)
export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.unknown()),
    required: z.array(z.string()).optional()
  })
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

// Tools list response
export const ToolsListResultSchema = z.object({
  tools: z.array(ToolDefinitionSchema)
});

export type ToolsListResult = z.infer<typeof ToolsListResultSchema>;

// JSON-RPC error object
export const JsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional()
});

export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

// Success response
export const MCPSuccessResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  result: z.union([
    InitializeResultSchema,
    ToolsListResultSchema,
    ToolResultSchema
  ])
});

export type MCPSuccessResponse = z.infer<typeof MCPSuccessResponseSchema>;

// Error response
export const MCPErrorResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema.nullable(),
  error: JsonRpcErrorSchema
});

export type MCPErrorResponse = z.infer<typeof MCPErrorResponseSchema>;

// Union of all response types
export type MCPResponse = MCPSuccessResponse | MCPErrorResponse;

// ============================================================================
// JSON-RPC Error Codes
// ============================================================================

export const JSON_RPC_ERROR_CODES = {
  // Standard JSON-RPC errors
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // MCP-specific errors (reserved range: -32000 to -32099)
  UNAUTHORIZED: -32001,
  RATE_LIMITED: -32002,
  INSUFFICIENT_DATA: -32003,
  CONVEX_ERROR: -32004
} as const;

// ============================================================================
// Server Capability Declaration
// ============================================================================

export const SERVER_INFO = {
  name: 'finanseal-mcp-server',
  version: '1.0.0'
} as const;

export const SERVER_CAPABILITIES = {
  tools: {
    listChanged: false // Tools don't change at runtime
  },
  resources: {},
  prompts: {}
} as const;

export const PROTOCOL_VERSION = '2024-11-05';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a successful MCP response
 */
export function createSuccessResponse(
  id: JsonRpcId,
  result: InitializeResult | ToolsListResult | ToolResult
): MCPSuccessResponse {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

/**
 * Create an error MCP response
 */
export function createErrorResponse(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown
): MCPErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data !== undefined && { data })
    }
  };
}

/**
 * Create a tool result with text content
 */
export function createToolResult(
  data: unknown,
  isError: boolean = false
): ToolResult {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(data)
    }],
    ...(isError && { isError: true })
  };
}

/**
 * Parse a tool result from MCP response
 */
export function parseToolResult<T>(result: ToolResult): T | null {
  const textContent = result.content.find(c => c.type === 'text');
  if (!textContent) return null;

  try {
    return JSON.parse(textContent.text) as T;
  } catch {
    return null;
  }
}
