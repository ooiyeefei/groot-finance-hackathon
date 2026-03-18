/**
 * Convex Query Contracts: Smart Vendor Intelligence
 *
 * This file defines query signatures for reading vendor intelligence data.
 * All queries are authenticated and business-scoped via Convex auth context.
 *
 * Date: 2026-03-16
 * Feature: 001-smart-vendor-intelligence
 */

import { Id } from "../../../convex/_generated/dataModel";
import {
  PriceHistoryRecord,
  PriceHistoryRecordWithVendor,
  PriceAnomalyAlert,
  PriceAnomalyAlertWithContext,
  VendorScorecard,
  VendorScorecardWithMeta,
  VendorRiskProfile,
  VendorRiskProfileWithMeta,
  CrossVendorItemGroup,
  CrossVendorItemGroupWithPrices,
  RecommendedAction,
  RecommendedActionWithContext,
  AlertStatus,
  SeverityLevel,
  AlertType,
  PriceTrendDataPoint,
  CrossVendorComparisonRow,
  PaginatedResponse,
} from "./types";

// ============================================================================
// P1: Price Tracking & Anomaly Detection
// ============================================================================

/**
 * Query: Get price history for a vendor
 *
 * Use Case: Vendor detail page, price trend chart
 * Auth: Requires authenticated user with access to businessId
 * Pagination: Supports cursor-based pagination (limit + cursor)
 *
 * Example Usage:
 * ```typescript
 * const priceHistory = useQuery(api.vendorPriceHistory.list, {
 *   businessId: "...",
 *   vendorId: "...",
 *   includeArchived: false,
 *   limit: 100,
 * });
 * ```
 */
export interface GetPriceHistoryQuery {
  args: {
    businessId: Id<"businesses">;
    vendorId?: Id<"vendors">;              // Optional: filter by vendor
    itemIdentifier?: string;               // Optional: filter by item
    startDate?: string;                    // Optional: YYYY-MM-DD format
    endDate?: string;                      // Optional: YYYY-MM-DD format
    includeArchived?: boolean;             // Default: false (exclude >2 years old)
    limit?: number;                        // Default: 100
    cursor?: string;                       // Optional: for pagination
  };
  returns: PaginatedResponse<PriceHistoryRecordWithVendor>;
}

/**
 * Query: Get price history for a specific item across all vendors
 *
 * Use Case: Cross-vendor price comparison
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const itemPrices = useQuery(api.vendorPriceHistory.getByItem, {
 *   businessId: "...",
 *   itemIdentifier: "BOLT-M8",
 * });
 * ```
 */
export interface GetPriceHistoryByItemQuery {
  args: {
    businessId: Id<"businesses">;
    itemIdentifier: string;
    includeArchived?: boolean;             // Default: false
  };
  returns: PriceHistoryRecordWithVendor[];
}

/**
 * Query: Get anomaly alerts (active or dismissed)
 *
 * Use Case: Alerts page, Action Center integration
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const alerts = useQuery(api.vendorPriceAnomalies.list, {
 *   businessId: "...",
 *   status: "active",
 *   severityLevel: "high-impact",
 *   limit: 50,
 * });
 * ```
 */
export interface GetAnomalyAlertsQuery {
  args: {
    businessId: Id<"businesses">;
    vendorId?: Id<"vendors">;              // Optional: filter by vendor
    status?: AlertStatus;                  // Optional: filter by status
    severityLevel?: SeverityLevel;         // Optional: filter by severity
    alertType?: AlertType;                 // Optional: filter by type
    limit?: number;                        // Default: 50
  };
  returns: PriceAnomalyAlertWithContext[];
}

/**
 * Query: Get anomaly alert by ID
 *
 * Use Case: Alert detail modal
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const alert = useQuery(api.vendorPriceAnomalies.getById, {
 *   businessId: "...",
 *   alertId: "...",
 * });
 * ```
 */
export interface GetAnomalyAlertByIdQuery {
  args: {
    businessId: Id<"businesses">;
    alertId: Id<"vendor_price_anomalies">;
  };
  returns: PriceAnomalyAlertWithContext | null;
}

// ============================================================================
// P2: Vendor Performance Scorecard
// ============================================================================

/**
 * Query: Get vendor scorecard by vendor ID
 *
 * Use Case: Vendor detail page
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const scorecard = useQuery(api.vendorScorecards.get, {
 *   businessId: "...",
 *   vendorId: "...",
 * });
 * ```
 */
export interface GetVendorScorecardQuery {
  args: {
    businessId: Id<"businesses">;
    vendorId: Id<"vendors">;
  };
  returns: VendorScorecardWithMeta | null;
}

/**
 * Query: List all vendor scorecards (sorted by metric)
 *
 * Use Case: Vendor comparison table, leaderboard
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const scorecards = useQuery(api.vendorScorecards.list, {
 *   businessId: "...",
 *   sortBy: "totalSpendYTD",
 *   sortOrder: "desc",
 *   limit: 50,
 * });
 * ```
 */
export interface ListVendorScorecardsQuery {
  args: {
    businessId: Id<"businesses">;
    sortBy?: "totalSpendYTD" | "priceStabilityScore" | "anomalyFlagsCount"; // Optional
    sortOrder?: "asc" | "desc";           // Optional: default "desc"
    limit?: number;                        // Default: 100
  };
  returns: VendorScorecardWithMeta[];
}

// ============================================================================
// P3: Price Intelligence Dashboard
// ============================================================================

/**
 * Query: Get price trend data for chart visualization
 *
 * Use Case: Price trend line chart (Recharts)
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const trendData = useQuery(api.vendorPriceHistory.getTrendData, {
 *   businessId: "...",
 *   vendorId: "...",
 *   itemIdentifier: "BOLT-M8",
 *   startDate: "2024-01-01",
 *   endDate: "2026-01-01",
 * });
 * ```
 */
export interface GetPriceTrendDataQuery {
  args: {
    businessId: Id<"businesses">;
    vendorId: Id<"vendors">;
    itemIdentifier: string;
    startDate?: string;                    // Optional: default 2 years ago
    endDate?: string;                      // Optional: default today
  };
  returns: PriceTrendDataPoint[];
}

/**
 * Query: Get cross-vendor item groups
 *
 * Use Case: Cross-vendor comparison dashboard
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const groups = useQuery(api.crossVendorItemGroups.list, {
 *   businessId: "...",
 *   matchSource: "user-confirmed",
 * });
 * ```
 */
export interface GetCrossVendorItemGroupsQuery {
  args: {
    businessId: Id<"businesses">;
    matchSource?: "ai-suggested" | "user-confirmed" | "user-created"; // Optional: filter
  };
  returns: CrossVendorItemGroup[];
}

/**
 * Query: Get cross-vendor item group with price data
 *
 * Use Case: Cross-vendor comparison table (with current prices)
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const groupWithPrices = useQuery(api.crossVendorItemGroups.getWithPrices, {
 *   businessId: "...",
 *   groupId: "...",
 * });
 * ```
 */
export interface GetCrossVendorItemGroupWithPricesQuery {
  args: {
    businessId: Id<"businesses">;
    groupId: Id<"cross_vendor_item_groups">;
  };
  returns: CrossVendorItemGroupWithPrices | null;
}

/**
 * Query: Get cross-vendor comparison data (for table display)
 *
 * Use Case: Cross-vendor comparison table
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const comparison = useQuery(api.vendorPriceHistory.getCrossVendorComparison, {
 *   businessId: "...",
 *   groupId: "...",
 * });
 * ```
 */
export interface GetCrossVendorComparisonQuery {
  args: {
    businessId: Id<"businesses">;
    groupId: Id<"cross_vendor_item_groups">;
  };
  returns: CrossVendorComparisonRow[];
}

// ============================================================================
// P4: Vendor Risk Analysis
// ============================================================================

/**
 * Query: Get vendor risk profile by vendor ID
 *
 * Use Case: Vendor detail page, risk analysis section
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const riskProfile = useQuery(api.vendorRiskProfiles.get, {
 *   businessId: "...",
 *   vendorId: "...",
 * });
 * ```
 */
export interface GetVendorRiskProfileQuery {
  args: {
    businessId: Id<"businesses">;
    vendorId: Id<"vendors">;
  };
  returns: VendorRiskProfileWithMeta | null;
}

/**
 * Query: List high-risk vendors
 *
 * Use Case: Risk dashboard, Action Center integration
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const highRiskVendors = useQuery(api.vendorRiskProfiles.listHighRisk, {
 *   businessId: "...",
 *   riskLevel: "high",
 *   limit: 20,
 * });
 * ```
 */
export interface ListHighRiskVendorsQuery {
  args: {
    businessId: Id<"businesses">;
    riskLevel?: "low" | "medium" | "high";  // Optional: default "high"
    limit?: number;                          // Default: 50
  };
  returns: VendorRiskProfileWithMeta[];
}

// ============================================================================
// P5: Smart Alerts & Recommended Actions
// ============================================================================

/**
 * Query: Get recommended actions for a vendor
 *
 * Use Case: Vendor detail page, action list
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const actions = useQuery(api.vendorRecommendedActions.list, {
 *   businessId: "...",
 *   vendorId: "...",
 *   status: "pending",
 * });
 * ```
 */
export interface GetRecommendedActionsQuery {
  args: {
    businessId: Id<"businesses">;
    vendorId?: Id<"vendors">;              // Optional: filter by vendor
    status?: "pending" | "completed" | "dismissed"; // Optional: filter by status
    limit?: number;                        // Default: 50
  };
  returns: RecommendedActionWithContext[];
}

/**
 * Query: Get recommended actions for an anomaly alert
 *
 * Use Case: Alert detail modal (show associated actions)
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * const actions = useQuery(api.vendorRecommendedActions.getByAnomalyAlert, {
 *   businessId: "...",
 *   anomalyAlertId: "...",
 * });
 * ```
 */
export interface GetRecommendedActionsByAnomalyQuery {
  args: {
    businessId: Id<"businesses">;
    anomalyAlertId: Id<"vendor_price_anomalies">;
  };
  returns: RecommendedActionWithContext[];
}

// ============================================================================
// MCP Integration (P5)
// ============================================================================

/**
 * Query: Analyze vendor pricing (MCP tool endpoint)
 *
 * Use Case: Chat agent calls `analyzeVendorPricing` tool
 * Auth: Requires MCP internal service key
 *
 * Example Usage:
 * ```typescript
 * const analysis = await callMCPTool("analyzeVendorPricing", {
 *   businessId: "...",
 *   vendorId: "...",
 *   dateRange: { start: "2025-01-01", end: "2026-01-01" },
 * });
 * ```
 */
export interface AnalyzeVendorPricingQuery {
  args: {
    businessId: Id<"businesses">;
    vendorId?: Id<"vendors">;              // Optional: analyze specific vendor
    dateRange?: {
      start: string;                       // YYYY-MM-DD
      end: string;                         // YYYY-MM-DD
    };
  };
  returns: {
    vendorName: string;
    totalAnomaliesDetected: number;
    highImpactAnomaliesCount: number;
    affectedItems: Array<{
      itemDescription: string;
      oldPrice: number;
      newPrice: number;
      percentageIncrease: number;
      currency: string;
    }>;
    recommendedActions: string[];          // Human-readable action descriptions
    summary: string;                       // AI-generated summary for chat response
  };
}

// ============================================================================
// Export all query contracts
// ============================================================================

export type VendorIntelligenceQueries = {
  // P1: Price tracking
  getPriceHistory: GetPriceHistoryQuery;
  getPriceHistoryByItem: GetPriceHistoryByItemQuery;
  getAnomalyAlerts: GetAnomalyAlertsQuery;
  getAnomalyAlertById: GetAnomalyAlertByIdQuery;

  // P2: Vendor scorecard
  getVendorScorecard: GetVendorScorecardQuery;
  listVendorScorecards: ListVendorScorecardsQuery;

  // P3: Price intelligence dashboard
  getPriceTrendData: GetPriceTrendDataQuery;
  getCrossVendorItemGroups: GetCrossVendorItemGroupsQuery;
  getCrossVendorItemGroupWithPrices: GetCrossVendorItemGroupWithPricesQuery;
  getCrossVendorComparison: GetCrossVendorComparisonQuery;

  // P4: Vendor risk analysis
  getVendorRiskProfile: GetVendorRiskProfileQuery;
  listHighRiskVendors: ListHighRiskVendorsQuery;

  // P5: Recommended actions
  getRecommendedActions: GetRecommendedActionsQuery;
  getRecommendedActionsByAnomaly: GetRecommendedActionsByAnomalyQuery;

  // MCP integration
  analyzeVendorPricing: AnalyzeVendorPricingQuery;
};
