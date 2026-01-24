/**
 * MCP Client Integration Module
 *
 * Exports for LangGraph agent to consume tools from external MCP servers
 */

// Configuration
export {
  type McpTransportType,
  type McpAuthType,
  type McpServerConfig,
  type McpConfig,
  loadMcpConfig,
  getMcpServerConfig,
  getEnabledMcpServers,
  isMcpEnabled,
  resolveAuthToken
} from './mcp-client-config'

// Client Manager
export {
  type McpConnection,
  type McpTool,
  McpClientManager,
  getMcpClient
} from './mcp-client'

// Tool Adapter
export {
  mcpToolToOpenAISchema,
  parseMcpToolName,
  McpToolWrapper,
  createMcpToolWrappers,
  getAllMcpToolSchemas,
  getMcpToolWrapper,
  isMcpTool
} from './mcp-tool-adapter'

// Logging (T071)
export {
  type McpToolEvent,
  logMcpToolStart,
  logMcpToolEnd,
  logMcpToolError,
  logMcpConnection,
  logMcpDiscovery,
  getMcpLogger,
  createServerLogger
} from './mcp-logger'

// Permissions (T072)
export {
  type ToolAccessLevel,
  type PlanKey,
  type UserRole,
  type McpServerPermission,
  type PermissionAwareUserContext,
  getUserPlan,
  getUserRole,
  canAccessMcpTool,
  filterMcpToolsByPermission,
  getAllowedMcpServers,
  getMcpPermissionConfig,
  setServerPermission
} from './mcp-permissions'

// Security Audit (T074)
export {
  type SecurityEventType,
  type SecuritySeverity,
  type SecurityAuditEvent,
  validateParameters,
  sanitizeParametersForAudit,
  checkRateLimit,
  auditMcpToolCall,
  logPermissionDenied,
  logValidationFailure,
  getRateLimitStatus,
  clearRateLimit
} from './mcp-security-audit'
