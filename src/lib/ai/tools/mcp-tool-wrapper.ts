/**
 * MCP Tool Wrapper — Delegates tool-factory calls to the MCP server.
 *
 * Used by tool-factory tools to call MCP endpoints instead of executing
 * business logic locally. Handles:
 * - HTTP call to MCP server with internal service auth
 * - Retry once on transient failures (5xx, timeout)
 * - Translation of MCPErrorResponse → ToolResult format
 * - Passing user context (_businessId, _userId, _userRole) for RBAC
 *
 * Part of 032-mcp-first migration.
 */

import type { UserContext, ToolResult } from './base-tool'

interface MCPJsonRpcResponse {
  jsonrpc: string
  id: number
  result?: {
    content?: Array<{ type: string; text: string }>
  }
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

const MCP_TIMEOUT_MS = 25_000 // 25s (Lambda has 30s timeout)

async function callMCPWithTimeout(
  url: string,
  serviceKey: string,
  toolName: string,
  args: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPJsonRpcResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': serviceKey,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
          _businessId: userContext.businessId,
          _userId: userContext.userId,
          _userRole: userContext.role,
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    return (await response.json()) as MCPJsonRpcResponse
  } finally {
    clearTimeout(timeout)
  }
}

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true
    if (error.message.includes('HTTP 5')) return true
    if (error.message.includes('ECONNREFUSED')) return true
    if (error.message.includes('ETIMEDOUT')) return true
  }
  return false
}

/**
 * Call an MCP tool and return a ToolResult compatible with BaseTool.
 *
 * Retries once on transient errors, then returns a user-friendly error.
 * No fallback to local execution — MCP is the single source of truth.
 */
export async function callMCPToolFromAgent(
  toolName: string,
  args: Record<string, unknown>,
  userContext: UserContext
): Promise<ToolResult> {
  const endpointUrl = process.env.MCP_ENDPOINT_URL
  const serviceKey = process.env.MCP_INTERNAL_SERVICE_KEY

  if (!endpointUrl || !serviceKey) {
    console.error(`[MCP Wrapper] Missing MCP_ENDPOINT_URL or MCP_INTERNAL_SERVICE_KEY`)
    return {
      success: false,
      error: "I couldn't connect to the analysis service. Please try again in a moment.",
    }
  }

  let lastError: unknown

  // Attempt up to 2 times (initial + 1 retry)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await callMCPWithTimeout(endpointUrl, serviceKey, toolName, args, userContext)

      // JSON-RPC level error
      if (data.error) {
        console.error(`[MCP Wrapper] ${toolName} JSON-RPC error:`, data.error.message)
        return {
          success: false,
          error: data.error.message || "I couldn't fetch that right now, please try again.",
        }
      }

      // Extract result text
      const textContent = data.result?.content?.find((c) => c.type === 'text')
      if (!textContent?.text) {
        return {
          success: true,
          data: 'No results returned.',
          metadata: { mcpTool: toolName },
        }
      }

      // Check if the tool itself returned an error object
      try {
        const parsed = JSON.parse(textContent.text)
        if (parsed.error === true && parsed.code) {
          return {
            success: false,
            error: parsed.message || "I couldn't complete that operation.",
            metadata: { mcpTool: toolName, errorCode: parsed.code },
          }
        }
      } catch {
        // Not JSON or not an error object — that's fine, return as-is
      }

      return {
        success: true,
        data: textContent.text,
        metadata: { mcpTool: toolName },
      }
    } catch (error) {
      lastError = error
      if (attempt === 0 && isTransientError(error)) {
        console.warn(`[MCP Wrapper] ${toolName} attempt ${attempt + 1} failed, retrying...`, error)
        continue
      }
      break
    }
  }

  console.error(`[MCP Wrapper] ${toolName} failed after retry:`, lastError)
  return {
    success: false,
    error: "I couldn't fetch that right now, please try again.",
    metadata: { mcpTool: toolName },
  }
}
