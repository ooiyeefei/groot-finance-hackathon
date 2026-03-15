/**
 * Fee Classifier Engine — Hybrid Tier 1 (Rules) + Tier 2 (AI)
 *
 * Tier 1: Database-stored keyword rules, case-insensitive substring match
 * Tier 2: DSPy classification via Gemini 3.1 Flash-Lite for unknown fee names
 *
 * Used by salesOrders.importBatch to classify fee breakdown items.
 */

import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Default fee account codes per the chart of accounts
export const FEE_ACCOUNT_CODES = {
  "5801": "Commission Fees",
  "5802": "Shipping Fees",
  "5803": "Service Fees",
  "5804": "Marketing Fees",
  "5810": "Payment Processing Fees",
  "5800": "Platform Fees (General)",
} as const;

// Default keyword rules seeded for new businesses (platform → keyword → accountCode)
export const DEFAULT_FEE_RULES: Array<{
  platform: string;
  keyword: string;
  accountCode: string;
  accountName: string;
}> = [
  // Commission
  { platform: "all", keyword: "commission", accountCode: "5801", accountName: "Commission Fees" },
  { platform: "all", keyword: "referral fee", accountCode: "5801", accountName: "Commission Fees" },
  { platform: "shopee", keyword: "seller commission", accountCode: "5801", accountName: "Commission Fees" },
  { platform: "shopee", keyword: "marketplace commission", accountCode: "5801", accountName: "Commission Fees" },
  { platform: "lazada", keyword: "commission fee", accountCode: "5801", accountName: "Commission Fees" },

  // Shipping
  { platform: "all", keyword: "shipping", accountCode: "5802", accountName: "Shipping Fees" },
  { platform: "all", keyword: "delivery fee", accountCode: "5802", accountName: "Shipping Fees" },
  { platform: "all", keyword: "postage", accountCode: "5802", accountName: "Shipping Fees" },
  { platform: "all", keyword: "freight", accountCode: "5802", accountName: "Shipping Fees" },
  { platform: "all", keyword: "logistics", accountCode: "5802", accountName: "Shipping Fees" },

  // Service
  { platform: "all", keyword: "service fee", accountCode: "5803", accountName: "Service Fees" },
  { platform: "all", keyword: "service charge", accountCode: "5803", accountName: "Service Fees" },
  { platform: "all", keyword: "transaction fee", accountCode: "5803", accountName: "Service Fees" },
  { platform: "all", keyword: "platform fee", accountCode: "5803", accountName: "Service Fees" },

  // Marketing
  { platform: "all", keyword: "marketing", accountCode: "5804", accountName: "Marketing Fees" },
  { platform: "all", keyword: "advertising", accountCode: "5804", accountName: "Marketing Fees" },
  { platform: "all", keyword: "ads fee", accountCode: "5804", accountName: "Marketing Fees" },
  { platform: "all", keyword: "promo fee", accountCode: "5804", accountName: "Marketing Fees" },
  { platform: "all", keyword: "sponsored", accountCode: "5804", accountName: "Marketing Fees" },

  // Payment Processing
  { platform: "stripe", keyword: "stripe fee", accountCode: "5810", accountName: "Payment Processing Fees" },
  { platform: "stripe", keyword: "processing fee", accountCode: "5810", accountName: "Payment Processing Fees" },
  { platform: "grabpay", keyword: "payment processing", accountCode: "5810", accountName: "Payment Processing Fees" },
];

export interface ClassifiedFee {
  feeName: string;
  amount: number;
  accountCode: string;
  accountName: string;
  confidence: number;
  tier: number;
  isNew: boolean;
}

interface FeeRule {
  keyword: string;
  accountCode: string;
  accountName: string;
  priority: number;
  platform: string;
}

/**
 * Classify a list of fee items using Tier 1 (rules-based keyword matching).
 *
 * @param feeItems - Array of { feeName, amount } to classify
 * @param rules - Database-stored keyword rules
 * @param platform - Source platform for platform-specific rules
 * @returns Array of ClassifiedFee with confidence scores
 */
export function classifyFeesWithRules(
  feeItems: Array<{ feeName: string; amount: number }>,
  rules: FeeRule[],
  platform: string
): ClassifiedFee[] {
  return feeItems.map((item) => {
    const feeLower = item.feeName.toLowerCase().trim();

    // Filter rules applicable to this platform
    const applicableRules = rules.filter(
      (r) => r.platform === "all" || r.platform === platform.toLowerCase()
    );

    // Find best matching rule — longest keyword match wins
    let bestMatch: FeeRule | null = null;
    let bestMatchLength = 0;
    let isExactMatch = false;

    for (const rule of applicableRules) {
      const keywordLower = rule.keyword.toLowerCase();

      if (feeLower === keywordLower) {
        // Exact match — highest priority
        if (!isExactMatch || keywordLower.length > bestMatchLength) {
          bestMatch = rule;
          bestMatchLength = keywordLower.length;
          isExactMatch = true;
        }
      } else if (!isExactMatch && feeLower.includes(keywordLower)) {
        // Substring match — use longest keyword
        const effectivePriority = rule.priority ?? keywordLower.length;
        if (keywordLower.length > bestMatchLength || (keywordLower.length === bestMatchLength && effectivePriority > (bestMatch?.priority ?? 0))) {
          bestMatch = rule;
          bestMatchLength = keywordLower.length;
        }
      }
    }

    if (bestMatch) {
      return {
        feeName: item.feeName,
        amount: item.amount,
        accountCode: bestMatch.accountCode,
        accountName: bestMatch.accountName,
        confidence: isExactMatch ? 0.98 : 0.90,
        tier: 1,
        isNew: false,
      };
    }

    // No match — mark as unclassified, will need Tier 2 or manual review
    return {
      feeName: item.feeName,
      amount: item.amount,
      accountCode: "5800", // Generic platform fees
      accountName: "Platform Fees (General)",
      confidence: 0,
      tier: 0, // 0 = unclassified
      isNew: true,
    };
  });
}

/**
 * Load classification rules for a business from the database.
 * Falls back to default rules if no business-specific rules exist.
 */
export async function loadClassificationRules(
  ctx: QueryCtx,
  businessId: Id<"businesses">
): Promise<FeeRule[]> {
  const dbRules = await ctx.db
    .query("fee_classification_rules")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .collect();

  const activeRules = dbRules.filter((r) => r.isActive && !r.deletedAt);

  if (activeRules.length > 0) {
    return activeRules.map((r) => ({
      keyword: r.keyword,
      accountCode: r.accountCode,
      accountName: r.accountName,
      priority: r.priority ?? r.keyword.length,
      platform: r.platform,
    }));
  }

  // Fall back to defaults
  return DEFAULT_FEE_RULES.map((r) => ({
    ...r,
    priority: r.keyword.length,
  }));
}

/**
 * Extract fee items from the legacy feeBreakdown object for classification.
 * Maps the fixed fields to named fee items.
 */
export function extractFeeItemsFromBreakdown(
  feeBreakdown: {
    commissionFee?: number;
    shippingFee?: number;
    marketingFee?: number;
    refundAmount?: number;
    otherFee?: number;
  } | undefined,
  platformFee: number | undefined
): Array<{ feeName: string; amount: number }> {
  if (!feeBreakdown && !platformFee) return [];

  const items: Array<{ feeName: string; amount: number }> = [];

  if (feeBreakdown) {
    if (feeBreakdown.commissionFee) items.push({ feeName: "Commission Fee", amount: feeBreakdown.commissionFee });
    if (feeBreakdown.shippingFee) items.push({ feeName: "Shipping Fee", amount: feeBreakdown.shippingFee });
    if (feeBreakdown.marketingFee) items.push({ feeName: "Marketing Fee", amount: feeBreakdown.marketingFee });
    if (feeBreakdown.refundAmount) items.push({ feeName: "Refund Amount", amount: feeBreakdown.refundAmount });
    if (feeBreakdown.otherFee) items.push({ feeName: "Other Fee", amount: feeBreakdown.otherFee });
  } else if (platformFee) {
    // No breakdown — single aggregate fee
    items.push({ feeName: "Platform Fee", amount: platformFee });
  }

  return items;
}

/**
 * Validate fee breakdown balance: grossAmount should equal netAmount + sum of all fees.
 * Returns { isBalanced, discrepancy } with ±0.01 tolerance.
 */
export function validateFeeBalance(
  grossAmount: number,
  netAmount: number | undefined,
  classifiedFees: ClassifiedFee[]
): { isBalanced: boolean; discrepancy: number } {
  if (netAmount === undefined) {
    return { isBalanced: true, discrepancy: 0 };
  }

  const totalFees = classifiedFees.reduce((sum, f) => sum + Math.abs(f.amount), 0);
  const discrepancy = grossAmount - netAmount - totalFees;

  return {
    isBalanced: Math.abs(discrepancy) <= 0.01,
    discrepancy: Math.round(discrepancy * 100) / 100,
  };
}

/**
 * Get the overall classification status for an order's fees.
 */
export function getClassificationStatus(
  classifiedFees: ClassifiedFee[]
): "classified" | "partial" | "unclassified" {
  if (classifiedFees.length === 0) return "unclassified";

  const allClassified = classifiedFees.every((f) => f.tier > 0);
  const noneClassified = classifiedFees.every((f) => f.tier === 0);

  if (allClassified) return "classified";
  if (noneClassified) return "unclassified";
  return "partial";
}

/**
 * Get the lowest confidence in a set of classified fees.
 * Used for the compact row confidence indicator.
 */
export function getLowestConfidence(classifiedFees: ClassifiedFee[]): number {
  if (classifiedFees.length === 0) return 0;
  return Math.min(...classifiedFees.map((f) => f.confidence));
}

/**
 * Get confidence level label and color for UI rendering.
 */
export function getConfidenceLevel(confidence: number): {
  level: "high" | "medium" | "low";
  color: "green" | "yellow" | "red";
} {
  if (confidence >= 0.90) return { level: "high", color: "green" };
  if (confidence >= 0.70) return { level: "medium", color: "yellow" };
  return { level: "low", color: "red" };
}
