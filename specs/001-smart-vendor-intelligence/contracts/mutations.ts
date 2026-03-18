/**
 * Convex Mutation Contracts: Smart Vendor Intelligence
 *
 * This file defines mutation signatures for modifying vendor intelligence data.
 * All mutations are authenticated and business-scoped via Convex auth context.
 *
 * Date: 2026-03-16
 * Feature: 001-smart-vendor-intelligence
 */

import { Id } from "../../../convex/_generated/dataModel";
import {
  PriceHistoryRecord,
  PriceAnomalyAlert,
  CrossVendorItemGroup,
  RecommendedAction,
  MatchSource,
  ActionStatus,
} from "./types";

// ============================================================================
// P1: Price Tracking & Anomaly Detection
// ============================================================================

/**
 * Mutation: Create price history record from invoice line item
 *
 * Use Case: Automatically called when invoice is processed (invoice.create mutation)
 * Auth: Requires authenticated user with access to businessId
 * Trigger: Invoice processing pipeline
 *
 * Example Usage:
 * ```typescript
 * await convex.mutation(api.vendorPriceHistory.create, {
 *   businessId: "...",
 *   vendorId: "...",
 *   invoiceId: "...",
 *   itemCode: "BOLT-M8",
 *   itemDescription: "M8 Stainless Steel Bolt",
 *   unitPrice: 5.20,
 *   quantity: 100,
 *   currency: "MYR",
 *   invoiceDate: "2026-03-16",
 * });
 * ```
 */
export interface CreatePriceHistoryRecordMutation {
  args: {
    businessId: Id<"businesses">;
    vendorId: Id<"vendors">;
    invoiceId: Id<"invoices">;
    itemCode?: string;                     // Optional: if present on invoice
    itemDescription: string;
    unitPrice: number;                     // Must be > 0
    quantity: number;                      // Must be > 0
    currency: string;                      // ISO 4217 code (MYR, USD, etc.)
    invoiceDate: string;                   // YYYY-MM-DD format
  };
  returns: {
    priceHistoryId: Id<"vendor_price_history">;
    anomalyDetected: boolean;              // True if anomaly triggered
    anomalyAlertId?: Id<"vendor_price_anomalies">; // If anomaly created
    matchConfidenceScore?: number;         // If fuzzy matching used
    requiresUserConfirmation: boolean;     // True if confidence <80%
  };
}

/**
 * Mutation: Confirm or reject fuzzy item match
 *
 * Use Case: User reviews low-confidence match (<80%) and confirms or rejects
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * await convex.mutation(api.vendorPriceHistory.confirmFuzzyMatch, {
 *   businessId: "...",
 *   priceHistoryId: "...",
 *   confirmed: true,
 * });
 * ```
 */
export interface ConfirmFuzzyMatchMutation {
  args: {
    businessId: Id<"businesses">;
    priceHistoryId: Id<"vendor_price_history">;
    confirmed: boolean;                    // True = confirm match, False = reject
  };
  returns: {
    success: boolean;
    linkedToExistingItem: boolean;         // True if confirmed and linked
    newItemIdentifierCreated?: string;     // If rejected, new unique identifier
  };
}

/**
 * Mutation: Dismiss anomaly alert
 *
 * Use Case: User clicks "Dismiss" on an alert
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * await convex.mutation(api.vendorPriceAnomalies.dismiss, {
 *   businessId: "...",
 *   alertId: "...",
 *   userFeedback: "Expected price increase due to market conditions",
 * });
 * ```
 */
export interface DismissAnomalyAlertMutation {
  args: {
    businessId: Id<"businesses">;
    alertId: Id<"vendor_price_anomalies">;
    userFeedback?: string;                 // Optional: reason for dismissal
  };
  returns: {
    success: boolean;
    dismissedAt: number;                   // Timestamp when dismissed
    trainingExampleRecorded: boolean;      // True if fed into DSPy learning loop
  };
}

// ============================================================================
// P3: Cross-Vendor Item Grouping
// ============================================================================

/**
 * Mutation: Create cross-vendor item group
 *
 * Use Case: User manually groups items OR AI suggests a grouping
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * await convex.mutation(api.crossVendorItemGroups.create, {
 *   businessId: "...",
 *   groupName: "M8 Bolt",
 *   itemReferences: [
 *     { vendorId: "...", itemIdentifier: "BOLT-M8" },
 *     { vendorId: "...", itemIdentifier: "M8-STEEL-BOLT" },
 *   ],
 *   matchSource: "user-created",
 * });
 * ```
 */
export interface CreateItemGroupMutation {
  args: {
    businessId: Id<"businesses">;
    groupName: string;
    itemReferences: Array<{
      vendorId: Id<"vendors">;
      itemIdentifier: string;
    }>;
    matchSource: MatchSource;              // "ai-suggested", "user-confirmed", "user-created"
  };
  returns: {
    groupId: Id<"cross_vendor_item_groups">;
    priceRecordsLinked: number;            // Count of price records linked to group
  };
}

/**
 * Mutation: Update cross-vendor item group
 *
 * Use Case: User edits group name or adds/removes items
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * await convex.mutation(api.crossVendorItemGroups.update, {
 *   businessId: "...",
 *   groupId: "...",
 *   groupName: "M8 Stainless Steel Bolt",
 *   itemReferences: [
 *     { vendorId: "...", itemIdentifier: "BOLT-M8" },
 *     { vendorId: "...", itemIdentifier: "M8-STEEL-BOLT" },
 *     { vendorId: "...", itemIdentifier: "SS-BOLT-M8" }, // Added new vendor
 *   ],
 * });
 * ```
 */
export interface UpdateItemGroupMutation {
  args: {
    businessId: Id<"businesses">;
    groupId: Id<"cross_vendor_item_groups">;
    groupName?: string;                    // Optional: update name
    itemReferences?: Array<{               // Optional: update members
      vendorId: Id<"vendors">;
      itemIdentifier: string;
    }>;
    matchSource?: MatchSource;             // Optional: update source (e.g., ai-suggested → user-confirmed)
  };
  returns: {
    success: boolean;
    priceRecordsLinked: number;            // Updated count of linked records
  };
}

/**
 * Mutation: Delete cross-vendor item group
 *
 * Use Case: User rejects AI suggestion or deletes manually created group
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * await convex.mutation(api.crossVendorItemGroups.delete, {
 *   businessId: "...",
 *   groupId: "...",
 * });
 * ```
 */
export interface DeleteItemGroupMutation {
  args: {
    businessId: Id<"businesses">;
    groupId: Id<"cross_vendor_item_groups">;
  };
  returns: {
    success: boolean;
    priceRecordsUnlinked: number;          // Count of price records unlinked
  };
}

// ============================================================================
// P5: Recommended Actions
// ============================================================================

/**
 * Mutation: Update action status (mark complete or dismissed)
 *
 * Use Case: User takes action or dismisses recommendation
 * Auth: Requires authenticated user with access to businessId
 *
 * Example Usage:
 * ```typescript
 * await convex.mutation(api.vendorRecommendedActions.updateStatus, {
 *   businessId: "...",
 *   actionId: "...",
 *   status: "completed",
 * });
 * ```
 */
export interface UpdateActionStatusMutation {
  args: {
    businessId: Id<"businesses">;
    actionId: Id<"vendor_recommended_actions">;
    status: ActionStatus;                  // "pending", "completed", "dismissed"
  };
  returns: {
    success: boolean;
    updatedAt: number;                     // Timestamp when status changed
  };
}

// ============================================================================
// Internal Mutations (scheduled crons, not user-facing)
// ============================================================================

/**
 * Internal Mutation: Detect anomalies (called by invoice processing)
 *
 * Use Case: Automatically runs when new price history record created
 * Auth: Internal mutation (no user auth required)
 * Trigger: Invoice processing pipeline
 *
 * Example Usage:
 * ```typescript
 * await ctx.runMutation(internal.vendorPriceAnomalies.detect, {
 *   businessId: "...",
 *   priceHistoryId: "...",
 * });
 * ```
 */
export interface DetectAnomaliesMutation {
  args: {
    businessId: Id<"businesses">;
    priceHistoryId: Id<"vendor_price_history">;
  };
  returns: {
    anomaliesCreated: Array<{
      anomalyAlertId: Id<"vendor_price_anomalies">;
      alertType: string;
      severityLevel: string;
    }>;
    recommendedActionsCreated: number;     // Count of actions generated
  };
}

/**
 * Internal Mutation: Archive old price history (>2 years)
 *
 * Use Case: Nightly cron to enforce 2-year retention policy
 * Auth: Internal mutation (scheduled cron)
 * Trigger: Daily at 2 AM UTC
 *
 * Example Usage:
 * ```typescript
 * await ctx.runMutation(internal.vendorPriceHistory.archive, {
 *   businessId: "...",
 * });
 * ```
 */
export interface ArchiveOldPriceHistoryMutation {
  args: {
    businessId?: Id<"businesses">;         // Optional: archive for specific business
  };
  returns: {
    archivedCount: number;                 // Count of records archived
    businessesProcessed: number;           // Count of businesses processed
  };
}

/**
 * Internal Mutation: Calculate vendor scorecard
 *
 * Use Case: Nightly cron to update vendor metrics
 * Auth: Internal mutation (scheduled cron)
 * Trigger: Daily at 3 AM UTC
 *
 * Example Usage:
 * ```typescript
 * await ctx.runMutation(internal.vendorScorecards.calculate, {
 *   businessId: "...",
 *   vendorId: "...",
 * });
 * ```
 */
export interface CalculateVendorScorecardMutation {
  args: {
    businessId: Id<"businesses">;
    vendorId: Id<"vendors">;
  };
  returns: {
    scorecard: {
      totalSpendYTD: number;
      invoiceVolume: number;
      averagePaymentCycle: number;
      priceStabilityScore: number;
      aiExtractionAccuracy: number;
      anomalyFlagsCount: number;
    };
    lastUpdatedTimestamp: number;
  };
}

/**
 * Internal Mutation: Calculate vendor risk profile
 *
 * Use Case: Weekly cron to update vendor risk scores
 * Auth: Internal mutation (scheduled cron)
 * Trigger: Weekly on Sunday at 2 AM UTC
 *
 * Example Usage:
 * ```typescript
 * await ctx.runMutation(internal.vendorRiskProfiles.calculate, {
 *   businessId: "...",
 *   vendorId: "...",
 * });
 * ```
 */
export interface CalculateVendorRiskProfileMutation {
  args: {
    businessId: Id<"businesses">;
    vendorId: Id<"vendors">;
  };
  returns: {
    riskProfile: {
      paymentRiskScore: number;
      concentrationRiskScore: number;
      complianceRiskScore: number;
      priceRiskScore: number;
      riskLevel: "low" | "medium" | "high";
    };
    lastCalculatedTimestamp: number;
  };
}

/**
 * Internal Mutation: Generate recommended actions
 *
 * Use Case: Automatically called when high-impact anomaly detected
 * Auth: Internal mutation (triggered by DetectAnomaliesMutation)
 *
 * Example Usage:
 * ```typescript
 * await ctx.runMutation(internal.vendorRecommendedActions.generate, {
 *   businessId: "...",
 *   anomalyAlertId: "...",
 * });
 * ```
 */
export interface GenerateRecommendedActionsMutation {
  args: {
    businessId: Id<"businesses">;
    anomalyAlertId: Id<"vendor_price_anomalies">;
  };
  returns: {
    actionsCreated: Array<{
      actionId: Id<"vendor_recommended_actions">;
      actionType: string;
      priorityLevel: string;
    }>;
  };
}

// ============================================================================
// DSPy Integration (Actions, not Mutations)
// ============================================================================

/**
 * Action: Suggest cross-vendor item matches (DSPy AI)
 *
 * Use Case: Background job to find similar items across vendors
 * Auth: Requires authenticated user with access to businessId
 * Note: This is a Convex action (can call external APIs), not a mutation
 *
 * Example Usage:
 * ```typescript
 * const suggestions = await convex.action(api.crossVendorItemGroups.suggestMatches, {
 *   businessId: "...",
 *   minConfidence: 80,
 * });
 * ```
 */
export interface SuggestCrossVendorMatchesAction {
  args: {
    businessId: Id<"businesses">;
    minConfidence?: number;                // Default: 80 (match spec threshold)
    limit?: number;                        // Default: 50 (max suggestions per run)
  };
  returns: {
    suggestedGroups: Array<{
      groupName: string;                   // AI-generated name
      itemReferences: Array<{
        vendorId: Id<"vendors">;
        itemIdentifier: string;
        vendorName: string;                // For display
      }>;
      confidenceScore: number;             // 0-100
      reasoning: string;                   // AI explanation
    }>;
    totalSuggestions: number;
  };
}

// ============================================================================
// Export all mutation contracts
// ============================================================================

export type VendorIntelligenceMutations = {
  // P1: Price tracking
  createPriceHistoryRecord: CreatePriceHistoryRecordMutation;
  confirmFuzzyMatch: ConfirmFuzzyMatchMutation;
  dismissAnomalyAlert: DismissAnomalyAlertMutation;

  // P3: Cross-vendor grouping
  createItemGroup: CreateItemGroupMutation;
  updateItemGroup: UpdateItemGroupMutation;
  deleteItemGroup: DeleteItemGroupMutation;

  // P5: Recommended actions
  updateActionStatus: UpdateActionStatusMutation;

  // Internal mutations (crons)
  detectAnomalies: DetectAnomaliesMutation;
  archiveOldPriceHistory: ArchiveOldPriceHistoryMutation;
  calculateVendorScorecard: CalculateVendorScorecardMutation;
  calculateVendorRiskProfile: CalculateVendorRiskProfileMutation;
  generateRecommendedActions: GenerateRecommendedActionsMutation;

  // DSPy integration (action, not mutation)
  suggestCrossVendorMatches: SuggestCrossVendorMatchesAction;
};
