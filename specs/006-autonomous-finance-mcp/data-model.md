# Data Model: Autonomous Finance MCP Server

**Branch**: `006-autonomous-finance-mcp` | **Date**: 2026-01-15
**Status**: Complete

## Overview

This document defines the MCP tool schemas, request/response types, and error formats for the FinanSEAL Intelligence MCP Server.

## MCP Tool Schemas

### Tool 1: `detect_anomalies`

Detect unusual financial transactions using statistical outlier analysis.

**Input Schema:**

```typescript
interface DetectAnomaliesInput {
  business_id: string;       // Required: Business context for authorization
  date_range?: {
    start: string;           // ISO 8601 date (e.g., "2026-01-01")
    end: string;             // ISO 8601 date (e.g., "2026-01-15")
  };
  category_filter?: string[]; // Optional: Filter to specific categories
  sensitivity: 'low' | 'medium' | 'high'; // Detection threshold
                              // low=3σ, medium=2σ, high=1.5σ
}
```

**Output Schema:**

```typescript
interface DetectAnomaliesOutput {
  anomalies: Array<{
    transaction_id: string;
    description: string;
    amount: number;
    currency: string;
    category: string;
    category_name: string;
    transaction_date: string;
    vendor_name?: string;
    z_score: number;          // How many std devs from mean
    category_mean: number;    // Historical mean for category
    category_stddev: number;  // Historical std dev
    severity: 'medium' | 'high' | 'critical';
    explanation: string;      // Human-readable anomaly description
  }>;
  summary: {
    total_transactions_analyzed: number;
    anomalies_found: number;
    date_range: {
      start: string;
      end: string;
    };
    sensitivity_used: 'low' | 'medium' | 'high';
    categories_analyzed: string[];
  };
}
```

**Example Response:**

```json
{
  "anomalies": [
    {
      "transaction_id": "jd7kfs2...",
      "description": "Office Supplies from Mega Corp",
      "amount": 5500.00,
      "currency": "SGD",
      "category": "OFFICE_SUPPLIES",
      "category_name": "Office Supplies",
      "transaction_date": "2026-01-10",
      "vendor_name": "Mega Corp",
      "z_score": 4.2,
      "category_mean": 450.00,
      "category_stddev": 120.00,
      "severity": "critical",
      "explanation": "This expense is 4.2 standard deviations above your typical Office Supplies spending (avg SGD 450)"
    }
  ],
  "summary": {
    "total_transactions_analyzed": 156,
    "anomalies_found": 1,
    "date_range": {
      "start": "2026-01-01",
      "end": "2026-01-15"
    },
    "sensitivity_used": "medium",
    "categories_analyzed": ["OFFICE_SUPPLIES", "TRAVEL", "SOFTWARE"]
  }
}
```

---

### Tool 2: `forecast_cash_flow`

Project future cash balance based on historical patterns.

**Input Schema:**

```typescript
interface ForecastCashFlowInput {
  business_id: string;       // Required: Business context
  horizon_days: number;      // Forecast horizon (7-90 days)
  scenario?: 'conservative' | 'moderate' | 'optimistic';
                             // Scenario for projections (default: moderate)
  include_recurring?: boolean; // Factor in recurring transactions
}
```

**Output Schema:**

```typescript
interface ForecastCashFlowOutput {
  forecast: Array<{
    date: string;            // ISO 8601 date
    projected_balance: number;
    projected_income: number;
    projected_expenses: number;
    confidence: 'high' | 'medium' | 'low';
  }>;
  alerts: Array<{
    type: 'negative_balance' | 'high_burn_rate' | 'low_runway';
    severity: 'warning' | 'critical';
    date?: string;           // When the alert condition occurs
    message: string;
    recommendation: string;
  }>;
  summary: {
    current_balance: number;
    projected_end_balance: number;
    total_projected_income: number;
    total_projected_expenses: number;
    net_change: number;
    burn_rate_daily: number;
    runway_days?: number;    // Days until zero balance (if applicable)
    scenario_used: string;
    horizon_days: number;
  };
}
```

**Example Response:**

```json
{
  "forecast": [
    {
      "date": "2026-01-16",
      "projected_balance": 45000.00,
      "projected_income": 2000.00,
      "projected_expenses": 1500.00,
      "confidence": "high"
    }
  ],
  "alerts": [
    {
      "type": "negative_balance",
      "severity": "critical",
      "date": "2026-02-28",
      "message": "Projected negative balance of SGD -5,200 by Feb 28",
      "recommendation": "Consider reducing discretionary spending or accelerating receivables"
    }
  ],
  "summary": {
    "current_balance": 50000.00,
    "projected_end_balance": -5200.00,
    "total_projected_income": 24000.00,
    "total_projected_expenses": 79200.00,
    "net_change": -55200.00,
    "burn_rate_daily": 1230.00,
    "runway_days": 41,
    "scenario_used": "moderate",
    "horizon_days": 45
  }
}
```

---

### Tool 3: `analyze_vendor_risk`

Analyze vendor concentration, spending changes, and risk factors.

**Input Schema:**

```typescript
interface AnalyzeVendorRiskInput {
  business_id: string;       // Required: Business context
  vendor_filter?: string[];  // Optional: Filter to specific vendors
  analysis_period_days?: number; // Lookback period (default: 90)
  include_concentration?: boolean; // Include concentration analysis
  include_spending_changes?: boolean; // Include spending trend analysis
}
```

**Output Schema:**

```typescript
interface AnalyzeVendorRiskOutput {
  vendors: Array<{
    vendor_name: string;
    total_spend: number;
    transaction_count: number;
    spend_percentage: number; // % of total spend
    categories: string[];
    risk_score: number;       // 0-100 (higher = more risk)
    risk_factors: string[];
    spending_trend: 'increasing' | 'stable' | 'decreasing';
    trend_percentage?: number; // % change vs previous period
  }>;
  concentration_risks: Array<{
    category: string;
    category_name: string;
    vendor_name: string;
    concentration_percentage: number;
    severity: 'medium' | 'high' | 'critical';
    message: string;
    recommendation: string;
  }>;
  spending_changes: Array<{
    vendor_name: string;
    previous_period_spend: number;
    current_period_spend: number;
    change_percentage: number;
    change_direction: 'increase' | 'decrease';
    significance: 'normal' | 'notable' | 'significant';
  }>;
  summary: {
    total_vendors: number;
    total_spend: number;
    high_risk_vendors: number;
    concentration_risks_found: number;
    significant_spending_changes: number;
    analysis_period: {
      start: string;
      end: string;
    };
  };
}
```

**Example Response:**

```json
{
  "vendors": [
    {
      "vendor_name": "AWS",
      "total_spend": 15000.00,
      "transaction_count": 3,
      "spend_percentage": 45.2,
      "categories": ["SOFTWARE"],
      "risk_score": 72,
      "risk_factors": ["High concentration", "Single category dependency"],
      "spending_trend": "increasing",
      "trend_percentage": 25.5
    }
  ],
  "concentration_risks": [
    {
      "category": "SOFTWARE",
      "category_name": "Software & Subscriptions",
      "vendor_name": "AWS",
      "concentration_percentage": 85,
      "severity": "high",
      "message": "85% of Software spending goes to a single vendor (AWS)",
      "recommendation": "Consider diversifying cloud providers or negotiating volume discounts"
    }
  ],
  "spending_changes": [
    {
      "vendor_name": "AWS",
      "previous_period_spend": 12000.00,
      "current_period_spend": 15000.00,
      "change_percentage": 25.0,
      "change_direction": "increase",
      "significance": "significant"
    }
  ],
  "summary": {
    "total_vendors": 23,
    "total_spend": 33200.00,
    "high_risk_vendors": 2,
    "concentration_risks_found": 1,
    "significant_spending_changes": 3,
    "analysis_period": {
      "start": "2025-10-15",
      "end": "2026-01-15"
    }
  }
}
```

---

## Error Response Format

All MCP tools use a consistent error response format.

```typescript
interface MCPErrorResponse {
  error: true;
  code: MCPErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

type MCPErrorCode =
  | 'UNAUTHORIZED'           // Business ID not found or access denied
  | 'INVALID_INPUT'          // Input validation failed
  | 'INSUFFICIENT_DATA'      // Not enough data to perform analysis
  | 'CONVEX_ERROR'           // Database query failed
  | 'INTERNAL_ERROR'         // Unexpected server error
  | 'RATE_LIMITED';          // Too many requests
```

**Example Error Response:**

```json
{
  "error": true,
  "code": "INSUFFICIENT_DATA",
  "message": "Not enough transactions in the selected date range to perform anomaly detection",
  "details": {
    "transactions_found": 5,
    "minimum_required": 10,
    "suggestion": "Expand the date range or wait for more transaction data"
  }
}
```

---

## MCP Protocol Types

### JSON-RPC 2.0 Request

```typescript
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/call' | 'tools/list' | 'initialize';
  params?: {
    name?: string;           // Tool name for tools/call
    arguments?: Record<string, unknown>; // Tool arguments
  };
}
```

### JSON-RPC 2.0 Response

```typescript
interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: {
    content: Array<{
      type: 'text';
      text: string;          // JSON-stringified tool result
    }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
```

---

## Server Capability Declaration

```typescript
interface MCPServerCapabilities {
  name: 'finanseal-mcp-server';
  version: '1.0.0';
  capabilities: {
    tools: {
      detect_anomalies: ToolCapability;
      forecast_cash_flow: ToolCapability;
      analyze_vendor_risk: ToolCapability;
    };
    resources: {};  // No resources in v1
    prompts: {};    // No prompts in v1
  };
}

interface ToolCapability {
  description: string;
  inputSchema: ZodSchema;
}
```

---

## Integration Types

### LangGraph Tool Adapter Types

```typescript
// Tool result from MCP client to LangGraph
interface MCPToolResult {
  success: boolean;
  data?: DetectAnomaliesOutput | ForecastCashFlowOutput | AnalyzeVendorRiskOutput;
  error?: MCPErrorResponse;
}

// Context passed to MCP tools
interface MCPToolContext {
  businessId: string;
  userId: string;
  conversationId?: string;
}
```

---

## Convex Function Mappings

| MCP Tool | Convex Function | Notes |
|----------|-----------------|-------|
| `detect_anomalies` | `insights:detectAnomalies` | Existing z-score algorithm |
| `forecast_cash_flow` | `insights:forecastCashFlow` | Existing projection logic |
| `analyze_vendor_risk` | `insights:vendorIntelligence` | Existing risk scoring |

---

## Validation Rules

### Business ID Validation
- Must be a valid Convex document ID
- User must have membership in the business
- Rate limited to 60 calls/minute per business

### Date Range Validation
- `start` must be before `end`
- Maximum range: 365 days
- Future dates not allowed for analysis (only forecasting)

### Sensitivity Mapping
| Sensitivity | Z-Score Threshold | Description |
|-------------|-------------------|-------------|
| `low` | 3.0σ | Only extreme outliers |
| `medium` | 2.0σ | Standard anomalies |
| `high` | 1.5σ | Sensitive detection |

### Horizon Validation
| Parameter | Min | Max | Default |
|-----------|-----|-----|---------|
| `horizon_days` | 7 | 90 | 30 |
| `analysis_period_days` | 7 | 365 | 90 |

---

## Next Steps

With data models defined, proceed to:
1. **contracts/** - Implement Zod schemas
2. **quickstart.md** - MVP implementation guide
