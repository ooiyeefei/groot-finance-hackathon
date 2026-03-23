/**
 * MCP Tool Registry — Single source of truth for agent tool schemas and execution.
 *
 * Replaces tool-factory.ts entirely. Instead of maintaining 22+ tool wrapper classes,
 * this module:
 * 1. Fetches tool schemas from MCP server via `tools/list` (cached 5 min)
 * 2. Converts MCP JSON Schema → OpenAI function calling format (for Gemini)
 * 3. Filters tools by user role (RBAC)
 * 4. Executes tools via MCP `tools/call` (callMCPToolFromAgent)
 *
 * Part of 032-mcp-first: tool-factory elimination.
 */

// ============================================
// TYPES (previously in base-tool.ts)
// ============================================

export interface UserContext {
  userId: string
  convexUserId?: string
  businessId?: string
  conversationId?: string
  role?: string
  homeCurrency?: string
}

import type { ToolResult, CitationData } from './base-tool'
export type { ToolResult, CitationData }

export type ToolParameters = Record<string, unknown>

interface OpenAIToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

// ============================================
// RBAC SETS — which tools require elevated roles
// ============================================

const MANAGER_TOOLS = new Set([
  'get_employee_expenses',
  'get_team_summary',
  'get_action_center_insight',
  'analyze_trends',
  'set_budget',
  'check_budget_status',
  'get_late_approvals',
  'compare_team_spending',
  'analyze_team_spending',
  'forecast_cash_flow',
  'generate_report_pdf',
  // Financial Statements (033-fin-statements-gen)
  'generate_trial_balance',
  'generate_pnl',
  'generate_balance_sheet',
  'generate_cash_flow',
])

const FINANCE_TOOLS = new Set([
  'get_invoices',
  'get_sales_invoices',
  'detect_anomalies',
  'analyze_vendor_risk',
  'get_ar_summary',
  'get_ap_aging',
  'get_business_transactions',
  'run_bank_reconciliation',
  'accept_recon_match',
  'show_recon_status',
  'send_email_report',
  'compare_to_industry',
  'toggle_benchmarking',
])

// ============================================
// SCHEMA CACHE
// ============================================

let cachedSchemas: OpenAIToolSchema[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ============================================
// CORE: Fetch schemas from MCP server
// ============================================

async function fetchMCPToolSchemas(): Promise<OpenAIToolSchema[]> {
  const now = Date.now()
  if (cachedSchemas && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedSchemas
  }

  const endpointUrl = process.env.MCP_ENDPOINT_URL
  const serviceKey = process.env.MCP_INTERNAL_SERVICE_KEY

  if (!endpointUrl || !serviceKey) {
    console.error('[MCPToolRegistry] Missing MCP_ENDPOINT_URL or MCP_INTERNAL_SERVICE_KEY')
    return cachedSchemas || [] // Return stale cache if available
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000) // 10s for schema fetch

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': serviceKey,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _businessId: 'schema-fetch', // Required by handler
          _userId: 'system',
          _userRole: 'owner', // Get all tools
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.error(`[MCPToolRegistry] tools/list HTTP ${response.status}`)
      return cachedSchemas || []
    }

    const data = await response.json()

    if (data.error) {
      console.error(`[MCPToolRegistry] tools/list error:`, data.error.message)
      return cachedSchemas || []
    }

    const mcpTools: MCPToolDefinition[] = data.result?.tools || []

    // Convert MCP format → OpenAI function calling format
    cachedSchemas = mcpTools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: cleanSchemaForGemini(tool.inputSchema),
      },
    }))

    cacheTimestamp = now
    console.log(`[MCPToolRegistry] Loaded ${cachedSchemas.length} tool schemas from MCP`)

    return cachedSchemas
  } catch (error) {
    console.error(`[MCPToolRegistry] Failed to fetch schemas:`, error instanceof Error ? error.message : error)
    return cachedSchemas || []
  }
}

/**
 * Clean MCP JSON Schema for Gemini compatibility.
 * Gemini requires 'type' on all properties and doesn't support some JSON Schema features.
 */
function cleanSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  // Strip fields Gemini doesn't support
  const cleaned = { ...schema }
  delete cleaned['$schema']
  delete cleaned['default']

  // Remove business_id from required (MCP passes it via context, not tool args)
  if (Array.isArray(cleaned.required)) {
    cleaned.required = (cleaned.required as string[]).filter(r => r !== 'business_id')
  }

  // Remove business_id from properties (agent doesn't need to pass it)
  if (cleaned.properties && typeof cleaned.properties === 'object') {
    const props = { ...(cleaned.properties as Record<string, unknown>) }
    delete props['business_id']
    cleaned.properties = props
  }

  return cleaned
}

// ============================================
// RBAC: Filter tools by user role
// ============================================

export async function getToolSchemasForRole(userRole?: string): Promise<OpenAIToolSchema[]> {
  const allSchemas = await fetchMCPToolSchemas()

  if (!userRole) {
    console.warn('[MCPToolRegistry] No user role — restricting to personal tools only')
    return allSchemas.filter((s) => {
      const name = s.function.name
      return !MANAGER_TOOLS.has(name) && !FINANCE_TOOLS.has(name)
    })
  }

  const role = userRole.toLowerCase()

  if (['finance_admin', 'owner'].includes(role)) {
    return allSchemas
  }

  if (role === 'manager') {
    return allSchemas.filter((s) => !FINANCE_TOOLS.has(s.function.name))
  }

  // Employee: personal tools only
  return allSchemas.filter((s) => {
    const name = s.function.name
    return !MANAGER_TOOLS.has(name) && !FINANCE_TOOLS.has(name)
  })
}

// ============================================
// EXECUTION: Call MCP tool with RBAC enforcement
// ============================================

export async function executeTool(
  toolName: string,
  parameters: ToolParameters,
  userContext: UserContext
): Promise<ToolResult> {
  // Validate user context
  if (!userContext || !userContext.userId) {
    return { success: false, error: 'Unauthorized: User context required' }
  }

  // Defense-in-depth RBAC
  const role = (userContext.role || '').toLowerCase()

  if (FINANCE_TOOLS.has(toolName) && !['finance_admin', 'owner'].includes(role)) {
    console.warn(`[MCPToolRegistry] RBAC DENIED: ${toolName} requires finance_admin/owner, user has role=${role}`)
    return {
      success: false,
      error: "Per your organization's access policy, financial reports like this are only available to Finance Admins and Business Owners. Please contact your admin if you need access to this data.",
      metadata: { rbacDenied: true, requiredTier: 'finance', userRole: role },
    }
  }

  if (MANAGER_TOOLS.has(toolName) && !['manager', 'finance_admin', 'owner'].includes(role)) {
    console.warn(`[MCPToolRegistry] RBAC DENIED: ${toolName} requires manager+, user has role=${role}`)
    return {
      success: false,
      error: "Per your organization's access policy, team data is only available to Managers, Finance Admins, and Business Owners. Please contact your admin if you need access.",
      metadata: { rbacDenied: true, requiredTier: 'manager', userRole: role },
    }
  }

  // Special RBAC: restrict income/revenue transaction queries for non-finance roles
  if (toolName === 'get_transactions' && !['finance_admin', 'owner'].includes(role)) {
    const txnType = parameters?.transactionType as string | undefined
    if (txnType && ['Income', 'income', 'Revenue', 'revenue'].includes(txnType)) {
      console.warn(`[MCPToolRegistry] RBAC DENIED: get_transactions(transactionType=${txnType}) blocked for role=${role}`)
      return {
        success: false,
        error: "Per your organization's access policy, revenue and income data is only available to Finance Admins and Business Owners.",
        metadata: { rbacDenied: true, requiredTier: 'finance', userRole: role },
      }
    }
  }

  // Execute via MCP
  try {
    const startTime = Date.now()
    const result = await callMCPToolDirect(toolName, parameters, userContext)
    result.executionTime = Date.now() - startTime
    result.toolName = toolName
    return result
  } catch (error) {
    console.error(`[MCPToolRegistry] ${toolName} execution error:`, error instanceof Error ? error.message : error)
    return {
      success: false,
      error: `Tool ${toolName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      toolName,
    }
  }
}

// ============================================
// MCP HTTP CALL (inline — no dependency on base-tool.ts)
// ============================================

const MCP_TIMEOUT_MS = 25_000

interface MCPJsonRpcResponse {
  jsonrpc: string
  id: number
  result?: { content?: Array<{ type: string; text: string }> }
  error?: { code: number; message: string; data?: unknown }
}

async function callMCPToolDirect(
  toolName: string,
  args: ToolParameters,
  userContext: UserContext
): Promise<ToolResult> {
  const endpointUrl = process.env.MCP_ENDPOINT_URL
  const serviceKey = process.env.MCP_INTERNAL_SERVICE_KEY

  if (!endpointUrl || !serviceKey) {
    return { success: false, error: "I couldn't connect to the analysis service. Please try again in a moment." }
  }

  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS)

      const response = await fetch(endpointUrl, {
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

      clearTimeout(timeout)

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`HTTP ${response.status}: ${text}`)
      }

      const data = (await response.json()) as MCPJsonRpcResponse

      // JSON-RPC level error
      if (data.error) {
        return { success: false, error: data.error.message || "I couldn't fetch that right now, please try again." }
      }

      // Extract result text
      const textContent = data.result?.content?.find((c) => c.type === 'text')
      if (!textContent?.text) {
        return { success: true, data: 'No results returned.', metadata: { mcpTool: toolName } }
      }

      // Check if the tool returned an error object
      try {
        const parsed = JSON.parse(textContent.text)
        if (parsed.error === true && parsed.code) {
          return { success: false, error: parsed.message || "I couldn't complete that operation.", metadata: { mcpTool: toolName, errorCode: parsed.code } }
        }
      } catch {
        // Not JSON error — fine
      }

      return { success: true, data: textContent.text, metadata: { mcpTool: toolName } }
    } catch (error) {
      lastError = error
      if (attempt === 0 && isTransientError(error)) {
        console.warn(`[MCPToolRegistry] ${toolName} attempt ${attempt + 1} failed, retrying...`)
        continue
      }
      break
    }
  }

  console.error(`[MCPToolRegistry] ${toolName} failed after retry:`, lastError)
  return { success: false, error: "I couldn't fetch that right now, please try again." }
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

// ============================================
// VALIDATION (replaces ToolFactory.validateTools)
// ============================================

export async function validateTools(): Promise<{ valid: boolean; errors: string[]; toolCount: number }> {
  try {
    const schemas = await fetchMCPToolSchemas()
    if (schemas.length === 0) {
      return { valid: false, errors: ['No tools loaded from MCP server'], toolCount: 0 }
    }

    const errors: string[] = []
    for (const schema of schemas) {
      if (!schema.function?.name) {
        errors.push(`Tool missing function.name: ${JSON.stringify(schema)}`)
      }
    }

    return { valid: errors.length === 0, errors, toolCount: schemas.length }
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : 'Unknown error'], toolCount: 0 }
  }
}
