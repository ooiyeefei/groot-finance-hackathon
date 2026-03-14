/**
 * MCP Client Configuration (T057)
 *
 * Registry of MCP servers the LangGraph agent can connect to.
 * Supports multiple transport types: stdio, HTTP (Streamable), WebSocket
 *
 * Configuration loaded from environment variables (MCP_SERVERS) or
 * hardcoded defaults for development.
 */

// Transport types supported by MCP SDK
export type McpTransportType = 'stdio' | 'http' | 'websocket'

// Authentication methods for MCP servers
export type McpAuthType = 'none' | 'bearer' | 'api_key' | 'basic'

/**
 * MCP Server Configuration
 */
export interface McpServerConfig {
  // Unique identifier for the server
  id: string

  // Human-readable name
  name: string

  // Server description
  description: string

  // Transport configuration
  transport: {
    type: McpTransportType

    // For HTTP/WebSocket: server URL
    url?: string

    // For stdio: command and args to spawn
    command?: string
    args?: string[]

    // Environment variables for stdio process
    env?: Record<string, string>
  }

  // Authentication configuration
  auth?: {
    type: McpAuthType

    // Environment variable name containing the token/key
    tokenEnvVar?: string

    // Static token (not recommended for production)
    token?: string

    // For basic auth
    username?: string
    passwordEnvVar?: string
  }

  // Connection settings
  connection?: {
    // Connection timeout in ms
    timeoutMs?: number

    // Retry settings
    maxRetries?: number
    retryDelayMs?: number

    // Health check interval (0 to disable)
    healthCheckIntervalMs?: number
  }

  // Tool filtering
  tools?: {
    // Allow all tools from this server
    allowAll?: boolean

    // Whitelist specific tools
    allowed?: string[]

    // Blacklist specific tools
    blocked?: string[]
  }

  // Feature flags
  enabled: boolean

  // Priority for tool conflict resolution (lower = higher priority)
  priority?: number

  // Tags for categorization
  tags?: string[]
}

/**
 * Complete MCP configuration
 */
export interface McpConfig {
  // List of MCP server configurations
  servers: McpServerConfig[]

  // Global settings
  global?: {
    // Default connection timeout
    defaultTimeoutMs?: number

    // Maximum concurrent connections
    maxConcurrentConnections?: number

    // Enable/disable MCP client entirely
    enabled?: boolean

    // Log level for MCP operations
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
  }
}

/**
 * Default MCP server configurations
 * These are the servers Groot Finance can connect to out of the box
 */
export const DEFAULT_MCP_SERVERS: McpServerConfig[] = [
  // Supabase MCP server removed — migrated to Convex

  // Context7 MCP Server (documentation search)
  {
    id: 'context7',
    name: 'Context7',
    description: 'Programming documentation and code examples',
    transport: {
      type: 'http',
      url: process.env.MCP_CONTEXT7_URL || ''
    },
    auth: {
      type: 'api_key',
      tokenEnvVar: 'MCP_CONTEXT7_API_KEY'
    },
    connection: {
      timeoutMs: 30000,
      maxRetries: 2,
      retryDelayMs: 500
    },
    tools: {
      allowAll: true
    },
    enabled: !!process.env.MCP_CONTEXT7_URL,
    priority: 20,
    tags: ['documentation', 'code']
  },

  // Groot Finance's own Financial Intelligence MCP Server
  {
    id: 'finanseal-intel',
    name: 'Groot Finance Intelligence',
    description: 'Financial anomaly detection, forecasting, vendor risk analysis',
    transport: {
      type: 'http',
      url: process.env.MCP_FINANSEAL_INTEL_URL || 'http://localhost:3001/mcp'
    },
    auth: {
      type: 'bearer',
      tokenEnvVar: 'MCP_FINANSEAL_INTEL_TOKEN'
    },
    connection: {
      timeoutMs: 60000, // Longer timeout for analytics
      maxRetries: 3,
      retryDelayMs: 2000,
      healthCheckIntervalMs: 60000
    },
    tools: {
      allowAll: true
    },
    enabled: !!process.env.MCP_FINANSEAL_INTEL_URL,
    priority: 1, // Highest priority for our own tools
    tags: ['financial', 'analytics', 'intelligence']
  }
]

/**
 * Default global MCP settings
 */
export const DEFAULT_MCP_GLOBAL_CONFIG: McpConfig['global'] = {
  defaultTimeoutMs: 30000,
  maxConcurrentConnections: 5,
  enabled: true,
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
}

/**
 * Load MCP configuration from environment or defaults
 */
export function loadMcpConfig(): McpConfig {
  // Check for JSON config in environment
  const envConfig = process.env.MCP_SERVERS

  if (envConfig) {
    try {
      const parsed = JSON.parse(envConfig) as McpConfig
      console.log('[MCP Config] Loaded configuration from MCP_SERVERS env var')
      return {
        servers: parsed.servers || [],
        global: { ...DEFAULT_MCP_GLOBAL_CONFIG, ...parsed.global }
      }
    } catch (error) {
      console.error('[MCP Config] Failed to parse MCP_SERVERS env var:', error)
    }
  }

  // Return defaults with enabled servers only
  const enabledServers = DEFAULT_MCP_SERVERS.filter(s => s.enabled)

  console.log(`[MCP Config] Using default config with ${enabledServers.length} enabled servers:`,
    enabledServers.map(s => s.id).join(', ') || 'none')

  return {
    servers: enabledServers,
    global: DEFAULT_MCP_GLOBAL_CONFIG
  }
}

/**
 * Get configuration for a specific MCP server
 */
export function getMcpServerConfig(serverId: string): McpServerConfig | null {
  const config = loadMcpConfig()
  return config.servers.find(s => s.id === serverId) || null
}

/**
 * Get all enabled MCP server configurations
 */
export function getEnabledMcpServers(): McpServerConfig[] {
  const config = loadMcpConfig()
  return config.servers.filter(s => s.enabled)
}

/**
 * Check if MCP client is globally enabled
 */
export function isMcpEnabled(): boolean {
  const config = loadMcpConfig()
  return config.global?.enabled ?? true
}

/**
 * Resolve authentication token for a server
 */
export function resolveAuthToken(serverConfig: McpServerConfig): string | null {
  if (!serverConfig.auth) return null

  // Try environment variable first
  if (serverConfig.auth.tokenEnvVar) {
    const token = process.env[serverConfig.auth.tokenEnvVar]
    if (token) return token
  }

  // Fall back to static token (not recommended)
  if (serverConfig.auth.token) {
    return serverConfig.auth.token
  }

  return null
}
