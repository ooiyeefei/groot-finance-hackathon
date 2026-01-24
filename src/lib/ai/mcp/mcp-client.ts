/**
 * MCP Client Manager (T059)
 *
 * Manages connections to multiple MCP servers with:
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Health monitoring
 * - Graceful degradation when servers unavailable
 * - Tool discovery and caching
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import {
  McpServerConfig,
  loadMcpConfig,
  getEnabledMcpServers,
  resolveAuthToken,
  isMcpEnabled
} from './mcp-client-config'
import { logMcpConnection, logMcpDiscovery } from './mcp-logger'

// Connection state for a single MCP server
export interface McpConnection {
  serverId: string
  serverName: string
  client: Client
  transport: StreamableHTTPClientTransport
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  lastError?: string
  connectedAt?: number
  tools: Tool[]
  healthCheckInterval?: NodeJS.Timeout
}

// Aggregated tool from MCP server
export interface McpTool extends Tool {
  serverId: string
  serverName: string
}

/**
 * MCP Client Manager
 * Singleton that manages all MCP server connections
 */
export class McpClientManager {
  private static instance: McpClientManager | null = null
  private connections: Map<string, McpConnection> = new Map()
  private initialized = false
  private initPromise: Promise<void> | null = null

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): McpClientManager {
    if (!McpClientManager.instance) {
      McpClientManager.instance = new McpClientManager()
    }
    return McpClientManager.instance
  }

  /**
   * Initialize connections to all enabled MCP servers
   */
  async initialize(): Promise<void> {
    // Return existing initialization promise if already initializing
    if (this.initPromise) {
      return this.initPromise
    }

    if (this.initialized) {
      return
    }

    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  private async doInitialize(): Promise<void> {
    if (!isMcpEnabled()) {
      console.log('[MCP Client] MCP client is disabled globally')
      this.initialized = true
      return
    }

    const servers = getEnabledMcpServers()
    console.log(`[MCP Client] Initializing connections to ${servers.length} MCP servers`)

    // Connect to all servers concurrently
    const connectionPromises = servers.map(server => this.connectToServer(server))
    const results = await Promise.allSettled(connectionPromises)

    // Log results
    let successCount = 0
    results.forEach((result, index) => {
      const server = servers[index]
      if (result.status === 'fulfilled') {
        successCount++
        console.log(`[MCP Client] Connected to ${server.id}`)
      } else {
        console.warn(`[MCP Client] Failed to connect to ${server.id}:`, result.reason)
      }
    })

    console.log(`[MCP Client] Initialization complete: ${successCount}/${servers.length} servers connected`)
    this.initialized = true
  }

  /**
   * Connect to a single MCP server
   */
  async connectToServer(serverConfig: McpServerConfig): Promise<McpConnection> {
    const { id, name, transport: transportConfig, auth, connection: connConfig } = serverConfig

    // Only HTTP transport supported for now (most common for deployed MCP servers)
    if (transportConfig.type !== 'http') {
      throw new Error(`Unsupported transport type: ${transportConfig.type}. Only HTTP is supported.`)
    }

    if (!transportConfig.url) {
      throw new Error(`No URL configured for server ${id}`)
    }

    console.log(`[MCP Client] Connecting to ${name} at ${transportConfig.url}`)

    // T071: Log connection attempt
    logMcpConnection(id, name, 'connecting')

    // Create MCP client
    const client = new Client({
      name: `finanseal-agent-${id}`,
      version: '1.0.0'
    })

    // Create HTTP transport with auth headers
    const headers: Record<string, string> = {}

    if (auth) {
      const token = resolveAuthToken(serverConfig)
      if (token) {
        if (auth.type === 'bearer') {
          headers['Authorization'] = `Bearer ${token}`
        } else if (auth.type === 'api_key') {
          headers['X-API-Key'] = token
        }
      }
    }

    const transport = new StreamableHTTPClientTransport(
      new URL(transportConfig.url),
      {
        requestInit: {
          headers
        }
      }
    )

    // Track connection state
    const connection: McpConnection = {
      serverId: id,
      serverName: name,
      client,
      transport,
      status: 'connecting',
      tools: []
    }

    this.connections.set(id, connection)

    try {
      // Connect with timeout
      const timeoutMs = connConfig?.timeoutMs || 30000
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)
        )
      ])

      connection.status = 'connected'
      connection.connectedAt = Date.now()

      // Discover available tools
      await this.discoverTools(id)

      // Set up health check if configured
      if (connConfig?.healthCheckIntervalMs && connConfig.healthCheckIntervalMs > 0) {
        connection.healthCheckInterval = setInterval(
          () => this.healthCheck(id),
          connConfig.healthCheckIntervalMs
        )
      }

      // T071: Log successful connection
      logMcpConnection(id, name, 'connected')

      console.log(`[MCP Client] Successfully connected to ${name} with ${connection.tools.length} tools`)
      return connection

    } catch (error) {
      connection.status = 'error'
      connection.lastError = error instanceof Error ? error.message : 'Unknown error'

      // T071: Log connection error
      logMcpConnection(id, name, 'error', connection.lastError)

      console.error(`[MCP Client] Failed to connect to ${name}:`, connection.lastError)
      throw error
    }
  }

  /**
   * Discover tools from a connected MCP server (T060)
   */
  async discoverTools(serverId: string): Promise<Tool[]> {
    const connection = this.connections.get(serverId)

    if (!connection || connection.status !== 'connected') {
      console.warn(`[MCP Client] Cannot discover tools: server ${serverId} not connected`)
      return []
    }

    try {
      const response = await connection.client.listTools()
      connection.tools = response.tools || []

      const toolNames = connection.tools.map(t => t.name)

      // T071: Log tool discovery
      logMcpDiscovery(serverId, connection.serverName, connection.tools.length, toolNames)

      console.log(`[MCP Client] Discovered ${connection.tools.length} tools from ${connection.serverName}:`,
        toolNames.join(', '))

      return connection.tools
    } catch (error) {
      console.error(`[MCP Client] Failed to discover tools from ${serverId}:`, error)
      return []
    }
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): McpTool[] {
    const allTools: McpTool[] = []

    for (const connection of this.connections.values()) {
      if (connection.status === 'connected') {
        for (const tool of connection.tools) {
          allTools.push({
            ...tool,
            serverId: connection.serverId,
            serverName: connection.serverName
          })
        }
      }
    }

    return allTools
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverId: string): McpTool[] {
    const connection = this.connections.get(serverId)

    if (!connection || connection.status !== 'connected') {
      return []
    }

    return connection.tools.map(tool => ({
      ...tool,
      serverId: connection.serverId,
      serverName: connection.serverName
    }))
  }

  /**
   * Execute a tool call on the appropriate MCP server
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const connection = this.connections.get(serverId)

    if (!connection) {
      return { success: false, error: `Unknown server: ${serverId}` }
    }

    if (connection.status !== 'connected') {
      return { success: false, error: `Server ${serverId} is not connected (status: ${connection.status})` }
    }

    try {
      console.log(`[MCP Client] Calling tool ${toolName} on ${connection.serverName}`)

      const result = await connection.client.callTool({
        name: toolName,
        arguments: args
      })

      // Extract result content
      let content: unknown = result

      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const firstContent = result.content[0]
        if ('text' in firstContent) {
          // Try to parse as JSON if it looks like JSON
          try {
            content = JSON.parse(firstContent.text as string)
          } catch {
            content = firstContent.text
          }
        } else {
          content = firstContent
        }
      } else if (result.structuredContent) {
        content = result.structuredContent
      }

      return { success: true, result: content }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[MCP Client] Tool call failed:`, errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Health check for a server
   */
  private async healthCheck(serverId: string): Promise<boolean> {
    const connection = this.connections.get(serverId)

    if (!connection) {
      return false
    }

    try {
      // Simple health check: list tools
      await connection.client.listTools()
      if (connection.status !== 'connected') {
        connection.status = 'connected'
        console.log(`[MCP Client] Server ${serverId} reconnected`)
      }
      return true
    } catch (error) {
      connection.status = 'error'
      connection.lastError = error instanceof Error ? error.message : 'Health check failed'
      console.warn(`[MCP Client] Health check failed for ${serverId}:`, connection.lastError)
      return false
    }
  }

  /**
   * Disconnect from a specific server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)

    if (!connection) {
      return
    }

    // Clear health check interval
    if (connection.healthCheckInterval) {
      clearInterval(connection.healthCheckInterval)
    }

    try {
      await connection.client.close()
    } catch (error) {
      console.warn(`[MCP Client] Error closing connection to ${serverId}:`, error)
    }

    connection.status = 'disconnected'

    // T071: Log disconnection
    logMcpConnection(serverId, connection.serverName, 'disconnected')

    console.log(`[MCP Client] Disconnected from ${serverId}`)
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map(id =>
      this.disconnectServer(id)
    )

    await Promise.allSettled(disconnectPromises)
    this.connections.clear()
    this.initialized = false
    this.initPromise = null

    console.log('[MCP Client] Disconnected from all servers')
  }

  /**
   * Get connection status for all servers
   */
  getConnectionStatus(): Map<string, { status: string; toolCount: number; lastError?: string }> {
    const status = new Map()

    for (const [id, connection] of this.connections.entries()) {
      status.set(id, {
        status: connection.status,
        toolCount: connection.tools.length,
        lastError: connection.lastError
      })
    }

    return status
  }

  /**
   * Check if any MCP server is connected
   */
  hasConnectedServers(): boolean {
    for (const connection of this.connections.values()) {
      if (connection.status === 'connected') {
        return true
      }
    }
    return false
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    if (McpClientManager.instance) {
      McpClientManager.instance.disconnectAll()
      McpClientManager.instance = null
    }
  }
}

// Export singleton accessor
export function getMcpClient(): McpClientManager {
  return McpClientManager.getInstance()
}
