/**
 * Shared TypeScript Types: Smart Vendor Intelligence
 *
 * This file defines type contracts for the vendor intelligence feature.
 * These types are used by both frontend components and Convex backend functions.
 *
 * Date: 2026-03-16
 * Feature: 001-smart-vendor-intelligence (#320)
 */

import { Doc, Id } from "../../../../convex/_generated/dataModel";

// ============================================================================
// Core Entity Types (from Convex schema)
// ============================================================================

export type PriceHistoryRecord = Doc<"vendor_price_history">;
export type PriceAnomalyAlert = Doc<"vendor_price_anomalies">;
export type VendorScorecard = Doc<"vendor_scorecards">;
export type VendorRiskProfile = Doc<"vendor_risk_profiles">;
export type CrossVendorItemGroup = Doc<"cross_vendor_item_groups">;
export type RecommendedAction = Doc<"vendor_recommended_actions">;

// ============================================================================
// Enums & Literal Types
// ============================================================================

export type AlertType =
  | "per-invoice"           // >10% from last invoice
  | "trailing-average"      // >20% from 6-month avg
  | "new-item"              // Item not in historical data
  | "frequency-change";     // Billing pattern changed ≥50%

export type SeverityLevel =
  | "standard"              // Standard alert (10-20%)
  | "high-impact";          // High-impact (>20% trailing avg)

export type AlertStatus =
  | "active"                // Not dismissed
  | "dismissed";            // User dismissed

export type PotentialIndicator =
  | "cash-flow-issues"
  | "billing-errors"
  | "contract-violations";

export type RiskLevel =
  | "low"                   // All scores <30
  | "medium"                // Any score 30-70
  | "high";                 // Any score >70

export type MatchSource =
  | "ai-suggested"          // DSPy suggested this grouping
  | "user-confirmed"        // User confirmed AI suggestion
  | "user-created";         // User manually created group

export type ActionType =
  | "request-quotes"        // Request quotes from alternative vendors
  | "negotiate"             // Negotiate pricing with vendor
  | "review-contract";      // Review contract terms

export type PriorityLevel =
  | "low"
  | "medium"
  | "high";

export type ActionStatus =
  | "pending"               // Not acted upon
  | "completed"             // User marked complete
  | "dismissed";            // User dismissed action

// ============================================================================
// Query Result Types (with enriched data)
// ============================================================================

/**
 * Price history record with enriched vendor information
 */
export interface PriceHistoryRecordWithVendor extends PriceHistoryRecord {
  vendor: {
    name: string;
    category?: string;
  };
}

/**
 * Price anomaly alert with enriched context
 */
export interface PriceAnomalyAlertWithContext extends PriceAnomalyAlert {
  vendor: {
    name: string;
    category?: string;
  };
  priceRecord?: PriceHistoryRecord; // Source price record (if applicable)
}

/**
 * Vendor scorecard with vendor metadata
 */
export interface VendorScorecardWithMeta extends VendorScorecard {
  vendor: {
    name: string;
    category?: string;
    contactEmail?: string;
    paymentTerms?: string;
  };
}

/**
 * Vendor risk profile with vendor metadata
 */
export interface VendorRiskProfileWithMeta extends VendorRiskProfile {
  vendor: {
    name: string;
    category?: string;
  };
}

/**
 * Cross-vendor item group with price data
 */
export interface CrossVendorItemGroupWithPrices extends CrossVendorItemGroup {
  priceData: Array<{
    vendorId: Id<"vendors">;
    vendorName: string;
    currentUnitPrice: number;
    lastPriceChangeDate: string;
    priceStabilityScore: number;
    currency: string;
  }>;
}

/**
 * Recommended action with anomaly context
 */
export interface RecommendedActionWithContext extends RecommendedAction {
  vendor: {
    name: string;
  };
  anomaly: PriceAnomalyAlert;
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Parameters for querying price history
 */
export interface GetPriceHistoryParams {
  businessId: Id<"businesses">;
  vendorId?: Id<"vendors">;               // Optional: filter by vendor
  itemIdentifier?: string;                // Optional: filter by item
  startDate?: string;                     // Optional: filter by date range (YYYY-MM-DD)
  endDate?: string;                       // Optional: filter by date range (YYYY-MM-DD)
  includeArchived?: boolean;              // Default: false
  limit?: number;                         // Optional: pagination limit
  cursor?: string;                        // Optional: pagination cursor
}

/**
 * Parameters for querying anomaly alerts
 */
export interface GetAnomalyAlertsParams {
  businessId: Id<"businesses">;
  vendorId?: Id<"vendors">;               // Optional: filter by vendor
  status?: AlertStatus;                   // Optional: filter by status
  severityLevel?: SeverityLevel;          // Optional: filter by severity
  alertType?: AlertType;                  // Optional: filter by type
  limit?: number;                         // Optional: pagination limit
}

/**
 * Parameters for dismissing an anomaly alert
 */
export interface DismissAnomalyAlertParams {
  businessId: Id<"businesses">;
  alertId: Id<"vendor_price_anomalies">;
  userFeedback?: string;                  // Optional: reason for dismissal
}

/**
 * Parameters for confirming a fuzzy match
 */
export interface ConfirmFuzzyMatchParams {
  businessId: Id<"businesses">;
  priceHistoryId: Id<"vendor_price_history">;
  confirmed: boolean;                     // True = confirm, False = reject
}

/**
 * Parameters for creating a cross-vendor item group
 */
export interface CreateItemGroupParams {
  businessId: Id<"businesses">;
  groupName: string;
  itemReferences: Array<{
    vendorId: Id<"vendors">;
    itemIdentifier: string;
  }>;
  matchSource: MatchSource;
}

/**
 * Parameters for updating a cross-vendor item group
 */
export interface UpdateItemGroupParams {
  businessId: Id<"businesses">;
  groupId: Id<"cross_vendor_item_groups">;
  groupName?: string;                     // Optional: update name
  itemReferences?: Array<{                // Optional: update members
    vendorId: Id<"vendors">;
    itemIdentifier: string;
  }>;
}

/**
 * Parameters for updating action status
 */
export interface UpdateActionStatusParams {
  businessId: Id<"businesses">;
  actionId: Id<"vendor_recommended_actions">;
  status: ActionStatus;
}

// ============================================================================
// Chart Data Types (for visualization)
// ============================================================================

/**
 * Data point for price trend chart (Recharts)
 */
export interface PriceTrendDataPoint {
  date: string;                           // Formatted date (e.g., "Jan 1, 2025")
  unitPrice: number;                      // Price at this date
  currency: string;                       // Currency code
  invoiceId: Id<"invoices">;              // Source invoice (for drill-down)
}

/**
 * Data for cross-vendor comparison table
 */
export interface CrossVendorComparisonRow {
  vendorId: Id<"vendors">;
  vendorName: string;
  currentUnitPrice: number;
  lastPriceChangeDate: string;            // Formatted date
  priceStabilityScore: number;            // 0-100
  currency: string;
  priceHistory: PriceTrendDataPoint[];   // For sparkline/mini-chart
}

// ============================================================================
// CSV Export Types
// ============================================================================

/**
 * Row structure for price history CSV export
 */
export interface PriceHistoryCSVRow {
  "Vendor Name": string;
  "Item Code": string;
  "Item Description": string;
  "Invoice Date": string;
  "Unit Price": string;                   // Formatted with 2 decimals
  "Quantity": string;
  "Total Amount": string;                 // Formatted with 2 decimals
  "Currency": string;
  "Observation Count": string;
}

// ============================================================================
// DSPy Integration Types
// ============================================================================

/**
 * Result from DSPy fuzzy item matcher
 */
export interface DSPyFuzzyMatchResult {
  itemA: string;                          // First item description
  itemB: string;                          // Second item description
  confidenceScore: number;                // 0-100 similarity score
  reasoning: string;                      // Explanation of match
  suggestedGroupName?: string;            // AI-suggested group name
}

/**
 * Training example for DSPy BootstrapFewShot
 */
export interface DSPyFuzzyMatchTrainingExample {
  itemDescriptionA: string;
  itemDescriptionB: string;
  groundTruthSimilar: boolean;           // True if user confirmed match
  userConfidenceScore?: number;           // Optional: user's confidence (if provided)
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  totalCount: number;
  hasMore: boolean;
  cursor?: string;                        // Next page cursor
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Error response from Convex mutation
 */
export interface ConvexError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
