/**
 * MCP Tool Adapter (T061-T063)
 *
 * Converts MCP tools to LangGraph-compatible format:
 * - MCP tool schema → OpenAI function schema (T062)
 * - McpToolWrapper class extending BaseTool (T063)
 * - Dynamic tool registration support
 */

import type { Tool as McpToolSchema } from '@modelcontextprotocol/sdk/types.js'
import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from '../tools/base-tool'
import { getMcpClient, McpTool } from './mcp-client'
import { logMcpToolStart, logMcpToolEnd, logMcpToolError } from './mcp-logger'
import { auditMcpToolCall, logValidationFailure } from './mcp-security-audit'

/**
 * Convert MCP JSON Schema to OpenAI-compatible parameter schema
 * MCP uses standard JSON Schema, OpenAI uses a subset
 */
function convertMcpSchemaToOpenAI(mcpSchema: McpToolSchema['inputSchema']): {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
} {
  if (!mcpSchema) {
    return {
      type: 'object',
      properties: {},
      required: []
    }
  }

  // MCP uses standard JSON Schema format which is compatible with OpenAI
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  // Extract properties from JSON Schema
  if (mcpSchema.properties && typeof mcpSchema.properties === 'object') {
    for (const [key, value] of Object.entries(mcpSchema.properties)) {
      if (typeof value === 'object' && value !== null) {
        // Copy property schema, converting any MCP-specific formats
        properties[key] = convertPropertySchema(value as Record<string, unknown>)
      }
    }
  }

  // Extract required fields
  if (Array.isArray(mcpSchema.required)) {
    required.push(...mcpSchema.required)
  }

  return {
    type: 'object',
    properties,
    required
  }
}

/**
 * Convert individual property schema
 */
function convertPropertySchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  // Copy standard JSON Schema fields
  const standardFields = ['type', 'description', 'enum', 'default', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'format']

  for (const field of standardFields) {
    if (schema[field] !== undefined) {
      result[field] = schema[field]
    }
  }

  // Handle nested objects
  if (schema.properties && typeof schema.properties === 'object') {
    result.properties = {}
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      if (typeof value === 'object' && value !== null) {
        (result.properties as Record<string, unknown>)[key] = convertPropertySchema(value as Record<string, unknown>)
      }
    }
  }

  // Handle arrays
  if (schema.items && typeof schema.items === 'object') {
    result.items = convertPropertySchema(schema.items as Record<string, unknown>)
  }

  // Handle oneOf/anyOf/allOf
  for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(schema[keyword])) {
      result[keyword] = (schema[keyword] as unknown[]).map(item =>
        typeof item === 'object' && item !== null
          ? convertPropertySchema(item as Record<string, unknown>)
          : item
      )
    }
  }

  return result
}

/**
 * Convert MCP tool to OpenAI tool schema (T062)
 */
export function mcpToolToOpenAISchema(mcpTool: McpTool): OpenAIToolSchema {
  return {
    type: 'function',
    function: {
      // Prefix with server ID to avoid name collisions
      name: `mcp_${mcpTool.serverId}_${mcpTool.name}`,
      description: mcpTool.description || `Tool from ${mcpTool.serverName}: ${mcpTool.name}`,
      parameters: convertMcpSchemaToOpenAI(mcpTool.inputSchema)
    }
  }
}

/**
 * Parse tool name to extract server ID and original tool name
 */
export function parseMcpToolName(fullName: string): { serverId: string; toolName: string } | null {
  if (!fullName.startsWith('mcp_')) {
    return null
  }

  const parts = fullName.substring(4).split('_')
  if (parts.length < 2) {
    return null
  }

  const serverId = parts[0]
  const toolName = parts.slice(1).join('_')

  return { serverId, toolName }
}

/**
 * MCP Tool Wrapper (T063)
 *
 * Wraps an MCP tool to be compatible with Groot Finance's BaseTool interface.
 * Handles:
 * - Schema conversion
 * - Execution via MCP client
 * - User context injection
 * - Error handling
 */
export class McpToolWrapper extends BaseTool {
  private mcpTool: McpTool
  private fullToolName: string

  constructor(mcpTool: McpTool) {
    super()
    this.mcpTool = mcpTool
    this.fullToolName = `mcp_${mcpTool.serverId}_${mcpTool.name}`
  }

  getToolName(_modelType?: ModelType): string {
    return this.fullToolName
  }

  getDescription(_modelType?: ModelType): string {
    return this.mcpTool.description || `Tool from ${this.mcpTool.serverName}: ${this.mcpTool.name}`
  }

  getToolSchema(_modelType?: ModelType): OpenAIToolSchema {
    return mcpToolToOpenAISchema(this.mcpTool)
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    // Basic validation - MCP server will do detailed validation
    if (parameters === undefined) {
      return { valid: false, error: 'Parameters cannot be undefined' }
    }

    // Check required parameters from schema
    const schema = this.mcpTool.inputSchema
    if (schema?.required && Array.isArray(schema.required)) {
      for (const required of schema.required) {
        if (parameters[required] === undefined) {
          return { valid: false, error: `Missing required parameter: ${required}` }
        }
      }
    }

    return { valid: true }
  }

  protected async executeInternal(
    parameters: ToolParameters,
    userContext: UserContext
  ): Promise<ToolResult> {
    const startTime = Date.now()

    // T074: Security audit before execution
    const audit = await auditMcpToolCall(
      this.fullToolName,
      this.mcpTool.serverId,
      parameters as Record<string, unknown>,
      userContext
    )

    if (!audit.allowed) {
      // Security audit failed - return error without executing
      logValidationFailure(
        this.fullToolName,
        this.mcpTool.serverId,
        userContext,
        audit.event.reason || 'Security audit failed'
      )

      return {
        toolName: this.fullToolName,
        success: false,
        error: audit.event.reason || 'Security validation failed',
        executionTime: Date.now() - startTime,
        metadata: {
          mcpServer: this.mcpTool.serverName,
          mcpServerId: this.mcpTool.serverId,
          securityEventType: audit.event.eventType,
          securityIssues: audit.event.issues
        }
      }
    }

    // T071: Log tool start (after security audit passes)
    logMcpToolStart(
      this.fullToolName,
      this.mcpTool.serverId,
      this.mcpTool.serverName,
      userContext,
      audit.sanitizedParams // Use sanitized params for logging
    )

    try {
      console.log(`[McpToolWrapper] Executing ${this.fullToolName} for user ${userContext.userId}`)

      // Inject user context into parameters for MCP server
      const enrichedParams = {
        ...parameters,
        _userContext: {
          userId: userContext.userId,
          businessId: userContext.businessId,
          conversationId: userContext.conversationId,
          role: userContext.role,
        }
      }

      // Call MCP server via client manager
      const mcpClient = getMcpClient()
      const result = await mcpClient.callTool(
        this.mcpTool.serverId,
        this.mcpTool.name,
        enrichedParams
      )

      const executionTime = Date.now() - startTime

      if (result.success) {
        // T071: Log successful completion
        logMcpToolEnd(
          this.fullToolName,
          this.mcpTool.serverId,
          this.mcpTool.serverName,
          userContext,
          executionTime,
          true
        )

        return {
          toolName: this.fullToolName,
          success: true,
          data: result.result,
          executionTime,
          metadata: {
            mcpServer: this.mcpTool.serverName,
            mcpServerId: this.mcpTool.serverId,
            originalToolName: this.mcpTool.name
          }
        }
      } else {
        // T071: Log failed completion
        logMcpToolEnd(
          this.fullToolName,
          this.mcpTool.serverId,
          this.mcpTool.serverName,
          userContext,
          executionTime,
          false,
          result.error || 'MCP tool execution failed'
        )

        return {
          toolName: this.fullToolName,
          success: false,
          error: result.error || 'MCP tool execution failed',
          executionTime,
          metadata: {
            mcpServer: this.mcpTool.serverName,
            mcpServerId: this.mcpTool.serverId
          }
        }
      }

    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // T071: Log tool error
      logMcpToolError(
        this.fullToolName,
        this.mcpTool.serverId,
        this.mcpTool.serverName,
        userContext,
        error instanceof Error ? error : errorMessage,
        executionTime
      )

      console.error(`[McpToolWrapper] Error executing ${this.fullToolName}:`, errorMessage)

      return {
        toolName: this.fullToolName,
        success: false,
        error: `MCP tool error: ${errorMessage}`,
        executionTime
      }
    }
  }

  protected formatResultData(data: unknown[]): string {
    // Generic formatting for MCP tool results
    return data.map((item, index) => {
      if (typeof item === 'object' && item !== null) {
        return `${index + 1}. ${JSON.stringify(item, null, 2)}`
      }
      return `${index + 1}. ${String(item)}`
    }).join('\n\n')
  }

  /**
   * Get the underlying MCP tool
   */
  getMcpTool(): McpTool {
    return this.mcpTool
  }
}

/**
 * Create wrapped tools from all connected MCP servers
 */
export function createMcpToolWrappers(): McpToolWrapper[] {
  const mcpClient = getMcpClient()
  const mcpTools = mcpClient.getAllTools()

  console.log(`[MCP Adapter] Creating wrappers for ${mcpTools.length} MCP tools`)

  return mcpTools.map(tool => new McpToolWrapper(tool))
}

/**
 * Get OpenAI schemas for all MCP tools
 */
export function getAllMcpToolSchemas(): OpenAIToolSchema[] {
  const mcpClient = getMcpClient()
  const mcpTools = mcpClient.getAllTools()

  return mcpTools.map(tool => mcpToolToOpenAISchema(tool))
}

/**
 * Find and create a wrapper for a specific MCP tool by full name
 */
export function getMcpToolWrapper(fullToolName: string): McpToolWrapper | null {
  const parsed = parseMcpToolName(fullToolName)
  if (!parsed) {
    return null
  }

  const mcpClient = getMcpClient()
  const serverTools = mcpClient.getServerTools(parsed.serverId)
  const tool = serverTools.find(t => t.name === parsed.toolName)

  if (!tool) {
    return null
  }

  return new McpToolWrapper(tool)
}

/**
 * Check if a tool name is an MCP tool
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp_')
}
