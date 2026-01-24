/**
 * MCP Tool Usage Logging (T071)
 *
 * Provides structured logging for MCP tool operations:
 * - Tool execution tracking (start/end/error)
 * - Performance metrics (duration, latency)
 * - Analytics-ready event format
 * - User context for audit trails
 *
 * Uses the centralized logger for environment-aware output and PII redaction.
 */

import { createLogger } from '@/lib/utils/logger'
import { UserContext } from '../tools/base-tool'

// Create dedicated MCP logger
const mcpLog = createLogger('MCP')

/**
 * MCP Tool Execution Event
 * Structured data for analytics and debugging
 */
export interface McpToolEvent {
  /** Event type */
  event: 'tool_start' | 'tool_end' | 'tool_error' | 'connection' | 'discovery'
  /** ISO timestamp */
  timestamp: string
  /** Tool name (full prefixed name) */
  toolName?: string
  /** Original tool name on MCP server */
  originalToolName?: string
  /** MCP server ID */
  serverId?: string
  /** MCP server name */
  serverName?: string
  /** User ID (redacted in production) */
  userId?: string
  /** Business ID (redacted in production) */
  businessId?: string
  /** Conversation ID */
  conversationId?: string
  /** Execution duration in milliseconds */
  durationMs?: number
  /** Whether the operation succeeded */
  success?: boolean
  /** Error message (if failed) */
  error?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Log MCP tool execution start
 */
export function logMcpToolStart(
  toolName: string,
  serverId: string,
  serverName: string,
  userContext: UserContext,
  args?: Record<string, unknown>
): void {
  const event: McpToolEvent = {
    event: 'tool_start',
    timestamp: new Date().toISOString(),
    toolName,
    originalToolName: extractOriginalToolName(toolName),
    serverId,
    serverName,
    userId: userContext.userId,
    businessId: userContext.businessId,
    conversationId: userContext.conversationId,
    metadata: args ? { argKeys: Object.keys(args) } : undefined
  }

  mcpLog.info('Tool execution started', event)
}

/**
 * Log MCP tool execution completion
 */
export function logMcpToolEnd(
  toolName: string,
  serverId: string,
  serverName: string,
  userContext: UserContext,
  durationMs: number,
  success: boolean,
  error?: string
): void {
  const event: McpToolEvent = {
    event: 'tool_end',
    timestamp: new Date().toISOString(),
    toolName,
    originalToolName: extractOriginalToolName(toolName),
    serverId,
    serverName,
    userId: userContext.userId,
    businessId: userContext.businessId,
    conversationId: userContext.conversationId,
    durationMs,
    success,
    error
  }

  if (success) {
    mcpLog.info('Tool execution completed', event)
  } else {
    mcpLog.warn('Tool execution failed', event)
  }
}

/**
 * Log MCP tool execution error
 */
export function logMcpToolError(
  toolName: string,
  serverId: string,
  serverName: string,
  userContext: UserContext,
  error: Error | string,
  durationMs?: number
): void {
  const errorMessage = error instanceof Error ? error.message : error

  const event: McpToolEvent = {
    event: 'tool_error',
    timestamp: new Date().toISOString(),
    toolName,
    originalToolName: extractOriginalToolName(toolName),
    serverId,
    serverName,
    userId: userContext.userId,
    businessId: userContext.businessId,
    conversationId: userContext.conversationId,
    durationMs,
    success: false,
    error: errorMessage
  }

  mcpLog.error('Tool execution error', event)
}

/**
 * Log MCP server connection event
 */
export function logMcpConnection(
  serverId: string,
  serverName: string,
  status: 'connecting' | 'connected' | 'disconnected' | 'error',
  error?: string
): void {
  const event: McpToolEvent = {
    event: 'connection',
    timestamp: new Date().toISOString(),
    serverId,
    serverName,
    success: status === 'connected',
    error,
    metadata: { status }
  }

  if (status === 'error') {
    mcpLog.error('Server connection failed', event)
  } else if (status === 'disconnected') {
    mcpLog.warn('Server disconnected', event)
  } else {
    mcpLog.info(`Server ${status}`, event)
  }
}

/**
 * Log MCP tool discovery event
 */
export function logMcpDiscovery(
  serverId: string,
  serverName: string,
  toolCount: number,
  toolNames: string[]
): void {
  const event: McpToolEvent = {
    event: 'discovery',
    timestamp: new Date().toISOString(),
    serverId,
    serverName,
    success: true,
    metadata: {
      toolCount,
      toolNames: toolNames.slice(0, 10), // Limit to first 10 for readability
      hasMore: toolNames.length > 10
    }
  }

  mcpLog.info('Tool discovery completed', event)
}

/**
 * Extract original tool name from prefixed MCP tool name
 * e.g., "mcp_finanseal_detect_anomalies" -> "detect_anomalies"
 */
function extractOriginalToolName(fullToolName: string): string {
  if (!fullToolName.startsWith('mcp_')) {
    return fullToolName
  }

  const parts = fullToolName.substring(4).split('_')
  if (parts.length < 2) {
    return fullToolName
  }

  // Skip server ID (first part) and join the rest
  return parts.slice(1).join('_')
}

/**
 * Get MCP logger for advanced use
 */
export function getMcpLogger() {
  return mcpLog
}

/**
 * Create a child logger for specific MCP server
 */
export function createServerLogger(serverId: string) {
  return mcpLog.child(serverId)
}
