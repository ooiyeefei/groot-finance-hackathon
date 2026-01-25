/**
 * MCP Client Wrapper for LangGraph Agent
 *
 * Provides a simple interface for calling MCP server tools from the LangGraph agent.
 * Uses HTTP transport for stateless communication with the Lambda MCP server.
 */

export interface MCPClientConfig {
  serverUrl: string;
  timeout?: number;
}

export interface MCPToolCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class MCPClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MCPClientError';
  }
}

export class MCPClient {
  private serverUrl: string;
  private timeout: number;
  private requestId: number = 0;

  constructor(config: MCPClientConfig) {
    this.serverUrl = config.serverUrl;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Initialize connection to MCP server
   */
  async initialize(): Promise<{ protocolVersion: string; serverInfo: { name: string; version: string } }> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'finanseal-langgraph-agent',
        version: '1.0.0',
      },
    });

    return response.result as { protocolVersion: string; serverInfo: { name: string; version: string } };
  }

  /**
   * List available tools from MCP server
   */
  async listTools(): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
    const response = await this.sendRequest('tools/list', {});
    const result = response.result as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
    return result.tools;
  }

  /**
   * Call an MCP tool
   */
  async callTool<T>(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult<T>> {
    try {
      const response = await this.sendRequest('tools/call', {
        name,
        arguments: args,
      });

      const result = response.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      // Parse the text content
      const textContent = result.content.find(c => c.type === 'text');
      if (!textContent) {
        return {
          success: false,
          error: {
            code: 'INVALID_RESPONSE',
            message: 'No text content in MCP response',
          },
        };
      }

      const parsed = JSON.parse(textContent.text);

      // Check if the tool returned an error
      if (result.isError || parsed.error) {
        return {
          success: false,
          error: {
            code: parsed.code || 'TOOL_ERROR',
            message: parsed.message || 'Tool execution failed',
            details: parsed.details,
          },
        };
      }

      return {
        success: true,
        data: parsed as T,
      };
    } catch (error) {
      if (error instanceof MCPClientError) {
        return {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Call multiple tools in parallel
   */
  async callToolsParallel<T extends Record<string, unknown>>(
    calls: Array<{ name: string; args: Record<string, unknown> }>
  ): Promise<Map<string, MCPToolCallResult<T[keyof T]>>> {
    const results = await Promise.allSettled(
      calls.map(call => this.callTool<T[keyof T]>(call.name, call.args))
    );

    const resultMap = new Map<string, MCPToolCallResult<T[keyof T]>>();

    calls.forEach((call, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') {
        resultMap.set(call.name, result.value);
      } else {
        resultMap.set(call.name, {
          success: false,
          error: {
            code: 'PARALLEL_CALL_FAILED',
            message: result.reason?.message || 'Parallel call failed',
          },
        });
      }
    });

    return resultMap;
  }

  /**
   * Send JSON-RPC request to MCP server
   */
  private async sendRequest(
    method: string,
    params: Record<string, unknown>
  ): Promise<{ result: unknown }> {
    const requestId = ++this.requestId;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method,
          params,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new MCPClientError(
          `HTTP error: ${response.status}`,
          'HTTP_ERROR',
          { status: response.status, body: errorText }
        );
      }

      const result = await response.json();

      // Check for JSON-RPC error
      if (result.error) {
        throw new MCPClientError(
          result.error.message,
          String(result.error.code),
          result.error.data
        );
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof MCPClientError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new MCPClientError('Request timeout', 'TIMEOUT');
      }

      throw new MCPClientError(
        error instanceof Error ? error.message : 'Unknown error',
        'REQUEST_FAILED'
      );
    }
  }
}

// Singleton instance
let mcpClient: MCPClient | null = null;

/**
 * Get the singleton MCP client instance
 */
export function getMCPClient(): MCPClient {
  if (!mcpClient) {
    const serverUrl = process.env.MCP_SERVER_URL;
    if (!serverUrl) {
      throw new MCPClientError(
        'MCP_SERVER_URL environment variable not set',
        'CONFIG_ERROR'
      );
    }
    mcpClient = new MCPClient({ serverUrl });
  }
  return mcpClient;
}

/**
 * Reset the MCP client singleton (for testing)
 */
export function resetMCPClient(): void {
  mcpClient = null;
}
