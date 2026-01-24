/**
 * MCP Tools Module - Public API
 *
 * Re-exports MCP client, tool adapters, and BaseTool implementations for LangGraph integration.
 */

// MCP Client
export {
  MCPClient,
  MCPClientError,
  getMCPClient,
  resetMCPClient,
  type MCPClientConfig,
  type MCPToolCallResult,
} from './mcp-client';

// Tool Adapters (for direct MCP client usage)
export {
  executeDetectAnomalies,
  executeForecastCashFlow,
  executeAnalyzeVendorRisk,
  detectAnomaliesSchema,
  forecastCashFlowSchema,
  analyzeVendorRiskSchema,
  MCP_TOOL_DEFINITIONS,
  formatToolResultForAgent,
  isMCPServerAvailable,
  type MCPToolContext,
  type MCPToolDefinition,
} from './mcp-tool-adapter';

// BaseTool implementations (for ToolFactory registration) - DISABLED: mem0ai dependency not installed
// export { MCPDetectAnomaliesTool } from './mcp-detect-anomalies-tool';
// export { MCPForecastCashFlowTool } from './mcp-forecast-cashflow-tool';
// export { MCPAnalyzeVendorRiskTool } from './mcp-analyze-vendor-risk-tool';

// Memory Integration (Phase 4) - DISABLED: mem0ai dependency not installed
// export {
//   recallAnomalyPatterns,
//   recallVendorRiskPatterns,
//   recallCashFlowPatterns,
//   storeAnomalyPatterns,
//   storeVendorRiskPatterns,
//   storeCashFlowPatterns,
//   formatRecalledPatternsForResponse,
//   type PatternMemory,
//   type MemoryContext,
//   type RecalledPatterns,
// } from './mcp-memory-integration';

// Multi-Tool Orchestration (Phase 5)
export {
  runComprehensiveAnalysis,
  runRiskAssessment,
  runCashPositionAnalysis,
  type OrchestrationContext,
  type ComprehensiveAnalysisResult,
  type RiskAssessmentResult,
  type CashPositionResult,
} from './mcp-orchestration';

// Rate Limiting (Phase 6)
export {
  MCPRateLimiter,
  getMCPRateLimiter,
  resetMCPRateLimiter,
  type RateLimiterConfig,
} from './mcp-rate-limiter';

// Observability (Phase 6)
export {
  mcpLogger,
  mcpMetrics,
  withObservability,
  type MCPLogEntry,
  type MCPMetrics,
} from './mcp-observability';
