/**
 * Test Seed Functions for Action Center
 *
 * Use these mutations to inject test data into the Action Center for development testing.
 *
 * Usage:
 *   npx convex run functions/testSeedActionCenter:seedInsights --args '{"businessId":"YOUR_BUSINESS_ID","userId":"YOUR_USER_ID"}'
 *   npx convex run functions/testSeedActionCenter:clearInsights --args '{"businessId":"YOUR_BUSINESS_ID"}'
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

/**
 * Seed sample insights for testing the Action Center UI
 * Creates one insight of each category with varying priorities
 */
export const seedInsights = mutation({
  args: {
    businessId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { businessId, userId } = args;
    const now = Date.now();

    const testInsights = [
      // Critical - Cashflow warning
      {
        userId,
        businessId,
        category: "cashflow" as const,
        priority: "critical" as const,
        status: "new" as const,
        title: "Low cash runway: 12 days remaining",
        description: "Based on your burn rate of MYR 45,000/month, your estimated runway is only 12 days. Immediate action required to avoid cash flow issues.",
        affectedEntities: [],
        recommendedAction: "Review expenses and prioritize collections immediately. Consider delaying non-essential payments.",
        detectedAt: now,
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
        metadata: { runwayDays: 12, monthlyBurnRate: 45000, estimatedBalance: 18000 },
      },
      // High - Anomaly detection
      {
        userId,
        businessId,
        category: "anomaly" as const,
        priority: "high" as const,
        status: "new" as const,
        title: "Unusual Office Supplies expense: MYR 12,500",
        description: "This Office Supplies expense of MYR 12,500 is 4.2σ above your average of MYR 850. This is significantly higher than your typical spending in this category.",
        affectedEntities: ["txn_sample_001"],
        recommendedAction: "Review this transaction to ensure it's legitimate and correctly categorized.",
        detectedAt: now - 1 * 60 * 60 * 1000, // 1 hour ago
        metadata: { deviation: 4.2, baseline: 850, category: "Office Supplies" },
      },
      // High - Deadline
      {
        userId,
        businessId,
        category: "deadline" as const,
        priority: "high" as const,
        status: "new" as const,
        title: "Payment due in 3 days: MYR 8,500",
        description: "Invoice #INV-2024-0892 from Acme Software Inc for MYR 8,500 is due on 2024-01-28.",
        affectedEntities: ["inv_sample_001"],
        recommendedAction: "Process this payment immediately to avoid late fees.",
        detectedAt: now - 2 * 60 * 60 * 1000,
        expiresAt: now + 3 * 24 * 60 * 60 * 1000,
        metadata: { dueDate: "2024-01-28", amount: 8500, vendorName: "Acme Software Inc" },
      },
      // Medium - Duplicate detection
      {
        userId,
        businessId,
        category: "anomaly" as const,
        priority: "medium" as const,
        status: "new" as const,
        title: "Potential duplicate: 2 transactions of MYR 2,450",
        description: "Found 2 transactions with the same amount (MYR 2,450) and date from CloudHost Services. These may be duplicate entries.",
        affectedEntities: ["txn_sample_002", "txn_sample_003"],
        recommendedAction: "Review these transactions to confirm they are not duplicates.",
        detectedAt: now - 4 * 60 * 60 * 1000,
        metadata: { amount: 2450, vendorName: "CloudHost Services", count: 2 },
      },
      // Medium - Vendor concentration
      {
        userId,
        businessId,
        category: "optimization" as const,
        priority: "medium" as const,
        status: "new" as const,
        title: "Vendor concentration risk: TechSupplies Co",
        description: "TechSupplies Co accounts for 68% of your IT Equipment spending. Consider diversifying suppliers to reduce dependency risk.",
        affectedEntities: ["vendor_sample_001"],
        recommendedAction: "Review your IT Equipment vendors and consider adding alternative suppliers.",
        detectedAt: now - 6 * 60 * 60 * 1000,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
        metadata: { vendorName: "TechSupplies Co", category: "IT Equipment", concentrationPercentage: 68 },
      },
      // Medium - Compliance
      {
        userId,
        businessId,
        category: "compliance" as const,
        priority: "medium" as const,
        status: "new" as const,
        title: "High-risk vendor: FastFreight Logistics",
        description: "FastFreight Logistics has a risk score of 78/100. Issues: Missing tax ID, No contact info, Irregular payment amounts.",
        affectedEntities: ["vendor_sample_002"],
        recommendedAction: "Update vendor information and verify business registration.",
        detectedAt: now - 12 * 60 * 60 * 1000,
        metadata: { vendorName: "FastFreight Logistics", riskScore: 78, riskFactors: ["Missing tax ID", "No contact info", "Irregular amounts"] },
      },
      // Low - Categorization
      {
        userId,
        businessId,
        category: "categorization" as const,
        priority: "low" as const,
        status: "new" as const,
        title: "23 transactions need categorization",
        description: "15% of your transactions are uncategorized. Proper categorization improves financial insights and reporting accuracy.",
        affectedEntities: [],
        recommendedAction: "Review and categorize your uncategorized transactions for better financial tracking.",
        detectedAt: now - 24 * 60 * 60 * 1000,
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
        metadata: { uncategorizedCount: 23, percentageAffected: 15 },
      },
      // Reviewed example
      {
        userId,
        businessId,
        category: "optimization" as const,
        priority: "low" as const,
        status: "reviewed" as const,
        title: "Spending decreased with PrintPro Services",
        description: "Spending with PrintPro Services has decreased by 62% compared to last month. This may indicate a change in usage or vendor relationship.",
        affectedEntities: ["vendor_sample_003"],
        recommendedAction: "Confirm if this is intentional or if there's an issue with the vendor.",
        detectedAt: now - 48 * 60 * 60 * 1000,
        reviewedAt: now - 24 * 60 * 60 * 1000,
        metadata: { vendorName: "PrintPro Services", changePercent: -62 },
      },
    ];

    const insertedIds = [];
    for (const insight of testInsights) {
      const id = await ctx.db.insert("actionCenterInsights", insight);
      insertedIds.push(id);
    }

    console.log(`[TestSeed] Created ${insertedIds.length} test insights for business ${businessId}`);
    return {
      success: true,
      count: insertedIds.length,
      message: `Created ${insertedIds.length} test insights`
    };
  },
});

/**
 * Clear all test insights for a business
 */
export const clearInsights = mutation({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const insights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_business_priority", (q) => q.eq("businessId", args.businessId))
      .collect();

    for (const insight of insights) {
      await ctx.db.delete(insight._id);
    }

    console.log(`[TestSeed] Deleted ${insights.length} insights for business ${args.businessId}`);
    return {
      success: true,
      deletedCount: insights.length,
      message: `Deleted ${insights.length} insights`
    };
  },
});

/**
 * List all insights (debug)
 */
export const listInsights = query({
  args: {
    businessId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let insights;
    const businessId = args.businessId;
    if (businessId) {
      insights = await ctx.db
        .query("actionCenterInsights")
        .withIndex("by_business_priority", (q) => q.eq("businessId", businessId))
        .collect();
    } else {
      insights = await ctx.db.query("actionCenterInsights").collect();
    }

    return {
      total: insights.length,
      insights: insights.map(i => ({
        _id: i._id,
        title: i.title,
        category: i.category,
        priority: i.priority,
        status: i.status,
        detectedAt: new Date(i.detectedAt).toISOString(),
      })),
    };
  },
});
