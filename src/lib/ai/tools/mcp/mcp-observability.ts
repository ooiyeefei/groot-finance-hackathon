/**
 * MCP Observability Module (Phase 6)
 *
 * Provides structured logging, metrics tracking, and monitoring
 * for MCP tool calls. Integrates with existing FinanSEAL logging patterns.
 */

export interface MCPLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  toolName: string
  businessId: string
  userId?: string
  conversationId?: string
  action: string
  durationMs?: number
  success?: boolean
  error?: {
    code: string
    message: string
  }
  metadata?: Record<string, unknown>
}

export interface MCPMetrics {
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  totalDurationMs: number
  avgDurationMs: number
  lastCallTimestamp: string
  errorsByCode: Record<string, number>
  callsByTool: Record<string, {
    total: number
    success: number
    failed: number
    avgDurationMs: number
  }>
}

class MCPLogger {
  private prefix = '[MCP]'

  private formatEntry(entry: MCPLogEntry): string {
    const parts = [
      this.prefix,
      `[${entry.toolName}]`,
      `[${entry.action}]`,
      entry.businessId ? `business=${entry.businessId}` : '',
      entry.userId ? `user=${entry.userId}` : '',
      entry.durationMs !== undefined ? `duration=${entry.durationMs}ms` : '',
      entry.success !== undefined ? `success=${entry.success}` : '',
      entry.error ? `error=${entry.error.code}:${entry.error.message}` : '',
    ].filter(Boolean)

    return parts.join(' ')
  }

  info(entry: Omit<MCPLogEntry, 'timestamp' | 'level'>): void {
    const fullEntry: MCPLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      level: 'info',
    }
    console.log(this.formatEntry(fullEntry))

    // Could integrate with external logging service here
    // e.g., Sentry breadcrumb, DataDog, etc.
  }

  warn(entry: Omit<MCPLogEntry, 'timestamp' | 'level'>): void {
    const fullEntry: MCPLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      level: 'warn',
    }
    console.warn(this.formatEntry(fullEntry))
  }

  error(entry: Omit<MCPLogEntry, 'timestamp' | 'level'>): void {
    const fullEntry: MCPLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      level: 'error',
    }
    console.error(this.formatEntry(fullEntry))

    // Could send to Sentry here
    // if (entry.error) {
    //   Sentry.captureMessage(entry.error.message, {
    //     level: 'error',
    //     extra: { ...entry },
    //   })
    // }
  }

  debug(entry: Omit<MCPLogEntry, 'timestamp' | 'level'>): void {
    // Only log debug in development
    if (process.env.NODE_ENV !== 'production') {
      const fullEntry: MCPLogEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
        level: 'debug',
      }
      console.debug(this.formatEntry(fullEntry))
    }
  }
}

class MCPMetricsCollector {
  private metrics: Map<string, MCPMetrics> = new Map()

  private getOrCreateMetrics(businessId: string): MCPMetrics {
    let m = this.metrics.get(businessId)
    if (!m) {
      m = {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
        lastCallTimestamp: new Date().toISOString(),
        errorsByCode: {},
        callsByTool: {},
      }
      this.metrics.set(businessId, m)
    }
    return m
  }

  recordCall(
    businessId: string,
    toolName: string,
    durationMs: number,
    success: boolean,
    errorCode?: string
  ): void {
    const m = this.getOrCreateMetrics(businessId)

    m.totalCalls++
    m.totalDurationMs += durationMs
    m.avgDurationMs = Math.round(m.totalDurationMs / m.totalCalls)
    m.lastCallTimestamp = new Date().toISOString()

    if (success) {
      m.successfulCalls++
    } else {
      m.failedCalls++
      if (errorCode) {
        m.errorsByCode[errorCode] = (m.errorsByCode[errorCode] || 0) + 1
      }
    }

    // Track per-tool metrics
    if (!m.callsByTool[toolName]) {
      m.callsByTool[toolName] = {
        total: 0,
        success: 0,
        failed: 0,
        avgDurationMs: 0,
      }
    }
    const toolMetrics = m.callsByTool[toolName]
    toolMetrics.total++
    if (success) {
      toolMetrics.success++
    } else {
      toolMetrics.failed++
    }
    // Recalculate average for this tool (approximation)
    toolMetrics.avgDurationMs = Math.round(
      (toolMetrics.avgDurationMs * (toolMetrics.total - 1) + durationMs) / toolMetrics.total
    )
  }

  getMetrics(businessId: string): MCPMetrics | undefined {
    return this.metrics.get(businessId)
  }

  getAllMetrics(): Map<string, MCPMetrics> {
    return new Map(this.metrics)
  }

  getGlobalMetrics(): {
    totalBusinesses: number
    totalCalls: number
    successRate: number
    avgDurationMs: number
  } {
    let totalCalls = 0
    let successfulCalls = 0
    let totalDurationMs = 0

    for (const m of this.metrics.values()) {
      totalCalls += m.totalCalls
      successfulCalls += m.successfulCalls
      totalDurationMs += m.totalDurationMs
    }

    return {
      totalBusinesses: this.metrics.size,
      totalCalls,
      successRate: totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0,
      avgDurationMs: totalCalls > 0 ? Math.round(totalDurationMs / totalCalls) : 0,
    }
  }

  reset(): void {
    this.metrics.clear()
  }
}

// Singleton instances
const logger = new MCPLogger()
const metricsCollector = new MCPMetricsCollector()

export const mcpLogger = logger
export const mcpMetrics = metricsCollector

/**
 * Convenience function to wrap a tool call with logging and metrics
 */
export async function withObservability<T>(
  context: {
    toolName: string
    businessId: string
    userId?: string
    conversationId?: string
  },
  operation: () => Promise<{ success: boolean; error?: { code: string; message: string }; data?: T }>
): Promise<{ success: boolean; error?: { code: string; message: string }; data?: T }> {
  const startTime = Date.now()

  mcpLogger.info({
    toolName: context.toolName,
    businessId: context.businessId,
    userId: context.userId,
    conversationId: context.conversationId,
    action: 'call_start',
  })

  try {
    const result = await operation()
    const durationMs = Date.now() - startTime

    mcpMetrics.recordCall(
      context.businessId,
      context.toolName,
      durationMs,
      result.success,
      result.error?.code
    )

    if (result.success) {
      mcpLogger.info({
        toolName: context.toolName,
        businessId: context.businessId,
        userId: context.userId,
        action: 'call_success',
        durationMs,
        success: true,
      })
    } else {
      mcpLogger.warn({
        toolName: context.toolName,
        businessId: context.businessId,
        userId: context.userId,
        action: 'call_failed',
        durationMs,
        success: false,
        error: result.error,
      })
    }

    return result
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorInfo = {
      code: 'UNEXPECTED_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    }

    mcpMetrics.recordCall(
      context.businessId,
      context.toolName,
      durationMs,
      false,
      errorInfo.code
    )

    mcpLogger.error({
      toolName: context.toolName,
      businessId: context.businessId,
      userId: context.userId,
      action: 'call_error',
      durationMs,
      success: false,
      error: errorInfo,
    })

    return { success: false, error: errorInfo }
  }
}
