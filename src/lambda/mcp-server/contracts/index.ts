/**
 * MCP Server Contracts - Public API
 *
 * Re-exports all contract types for convenient imports.
 */

// Tool schemas and types
export * from './mcp-tools.js';

// Protocol types and helpers
// Note: MCPErrorResponse is exported from mcp-tools.js (tool-level error)
// MCPErrorResponseSchema is the Zod schema version from mcp-protocol.js
export {
  MCPRequestSchema,
  MCPErrorResponseSchema,
  type MCPRequest,
  type MCPSuccessResponse,
  createErrorResponse,
  createSuccessResponse,
} from './mcp-protocol.js';
