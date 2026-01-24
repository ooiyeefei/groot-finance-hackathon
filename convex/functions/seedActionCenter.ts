/**
 * Seed Script: Action Center Test Data for Dev Environment
 *
 * This script injects accounting entries that will trigger various
 * Action Center insights when viewing the analytics dashboard.
 *
 * Usage:
 *   npx convex run scripts/seed-action-center-dev:seedActionCenterData
 *
 * Or via the Convex dashboard:
 *   1. Open Convex dashboard: npx convex dashboard
 *   2. Go to Functions > scripts/seed-action-center-dev > seedActionCenterData
 *   3. Click "Run"
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";

// Helper to generate dates
const today = new Date();
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};
const daysFromNow = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

export const seedActionCenterData = mutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { businessId, userId } = args;
    const now = Date.now();

    console.log(`[Seed] Starting Action Center test data injection...`);
    console.log(`[Seed] Business ID: ${businessId}`);
    console.log(`[Seed] User ID: ${userId}`);

    const entries: Array<{
      businessId: typeof businessId;
      userId: typeof userId;
      transactionType: "Income" | "Cost of Goods Sold" | "Expense";
      description: string;
      originalAmount: number;
      originalCurrency: string;
      homeCurrency: string;
      homeCurrencyAmount: number;
      exchangeRate: number;
      transactionDate: string;
      category: string;
      vendorName?: string;
      status: "pending" | "paid" | "overdue";
      dueDate?: string;
      createdByMethod: "manual";
      updatedAt: number;
    }> = [];

    // ============================================
    // 1. OVERDUE PAYMENTS (triggers "Overdue Payments" alert)
    // ============================================
    entries.push({
      businessId,
      userId,
      transactionType: "Expense",
      description: "Overdue invoice - Office Equipment",
      originalAmount: 2500,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 2500,
      exchangeRate: 1,
      transactionDate: daysAgo(30),
      category: "office_equipment",
      vendorName: "Tech Supplies Sdn Bhd",
      status: "overdue",
      dueDate: daysAgo(5), // Past due!
      createdByMethod: "manual",
      updatedAt: now,
    });

    entries.push({
      businessId,
      userId,
      transactionType: "Expense",
      description: "Overdue invoice - Software License",
      originalAmount: 1800,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 1800,
      exchangeRate: 1,
      transactionDate: daysAgo(25),
      category: "software_subscriptions",
      vendorName: "Cloud Services Malaysia",
      status: "overdue",
      dueDate: daysAgo(10), // Past due!
      createdByMethod: "manual",
      updatedAt: now,
    });

    // ============================================
    // 2. UPCOMING DUE DATES (triggers "Upcoming Due Dates" alert)
    // ============================================
    entries.push({
      businessId,
      userId,
      transactionType: "Expense",
      description: "Rent payment - Due in 3 days",
      originalAmount: 5000,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 5000,
      exchangeRate: 1,
      transactionDate: daysAgo(5),
      category: "rent_facilities",
      vendorName: "Property Management Co",
      status: "pending",
      dueDate: daysFromNow(3), // Due soon!
      createdByMethod: "manual",
      updatedAt: now,
    });

    entries.push({
      businessId,
      userId,
      transactionType: "Expense",
      description: "Utility bill - Due in 5 days",
      originalAmount: 800,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 800,
      exchangeRate: 1,
      transactionDate: daysAgo(3),
      category: "utilities_communications",
      vendorName: "TNB Electric",
      status: "pending",
      dueDate: daysFromNow(5), // Due soon!
      createdByMethod: "manual",
      updatedAt: now,
    });

    entries.push({
      businessId,
      userId,
      transactionType: "Expense",
      description: "Insurance premium - Due in 6 days",
      originalAmount: 1200,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 1200,
      exchangeRate: 1,
      transactionDate: daysAgo(2),
      category: "insurance",
      vendorName: "Allianz Insurance",
      status: "pending",
      dueDate: daysFromNow(6), // Due soon!
      createdByMethod: "manual",
      updatedAt: now,
    });

    // ============================================
    // 3. AWAITING PAYMENT (triggers "Awaiting Payment" alert)
    // ============================================
    entries.push({
      businessId,
      userId,
      transactionType: "Expense",
      description: "Marketing campaign payment",
      originalAmount: 3500,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 3500,
      exchangeRate: 1,
      transactionDate: daysAgo(7),
      category: "marketing_advertising",
      vendorName: "Digital Marketing Agency",
      status: "pending",
      createdByMethod: "manual",
      updatedAt: now,
    });

    entries.push({
      businessId,
      userId,
      transactionType: "Expense",
      description: "Consultant fees pending",
      originalAmount: 4000,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 4000,
      exchangeRate: 1,
      transactionDate: daysAgo(10),
      category: "professional_services",
      vendorName: "Business Consultants Sdn Bhd",
      status: "pending",
      createdByMethod: "manual",
      updatedAt: now,
    });

    // ============================================
    // 4. NEGATIVE PROFIT (triggers "Negative Profit Alert")
    // High expenses, low income this month
    // ============================================

    // Low income entries
    entries.push({
      businessId,
      userId,
      transactionType: "Income",
      description: "Client project payment",
      originalAmount: 8000,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 8000,
      exchangeRate: 1,
      transactionDate: daysAgo(15),
      category: "operating_revenue",
      vendorName: "ABC Corporation",
      status: "paid",
      createdByMethod: "manual",
      updatedAt: now,
    });

    entries.push({
      businessId,
      userId,
      transactionType: "Income",
      description: "Consulting fees",
      originalAmount: 5000,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 5000,
      exchangeRate: 1,
      transactionDate: daysAgo(20),
      category: "operating_revenue",
      vendorName: "XYZ Company",
      status: "paid",
      createdByMethod: "manual",
      updatedAt: now,
    });

    // High expense entries (total > income to create negative profit)
    entries.push({
      businessId,
      userId,
      transactionType: "Expense",
      description: "Major equipment purchase",
      originalAmount: 15000,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 15000,
      exchangeRate: 1,
      transactionDate: daysAgo(12),
      category: "other_operating",
      vendorName: "Industrial Equipment Supplier",
      status: "paid",
      createdByMethod: "manual",
      updatedAt: now,
    });

    // ============================================
    // 5. MULTI-CURRENCY EXPOSURE (triggers "Multi-Currency Exposure" alert)
    // Need >2 currencies with >1000 amount each
    // ============================================
    entries.push({
      businessId,
      userId,
      transactionType: "Expense",
      description: "International supplier payment",
      originalAmount: 2000,
      originalCurrency: "USD",
      homeCurrency: "MYR",
      homeCurrencyAmount: 9400, // ~4.7 rate
      exchangeRate: 4.7,
      transactionDate: daysAgo(8),
      category: "cost_of_goods_sold",
      vendorName: "US Tech Supplier Inc",
      status: "paid",
      createdByMethod: "manual",
      updatedAt: now,
    });

    entries.push({
      businessId,
      userId,
      transactionType: "Expense",
      description: "Singapore vendor invoice",
      originalAmount: 3000,
      originalCurrency: "SGD",
      homeCurrency: "MYR",
      homeCurrencyAmount: 10500, // ~3.5 rate
      exchangeRate: 3.5,
      transactionDate: daysAgo(6),
      category: "professional_services",
      vendorName: "Singapore Services Pte Ltd",
      status: "paid",
      createdByMethod: "manual",
      updatedAt: now,
    });

    entries.push({
      businessId,
      userId,
      transactionType: "Income",
      description: "Thai client payment",
      originalAmount: 50000,
      originalCurrency: "THB",
      homeCurrency: "MYR",
      homeCurrencyAmount: 6500, // ~0.13 rate
      exchangeRate: 0.13,
      transactionDate: daysAgo(4),
      category: "operating_revenue",
      vendorName: "Bangkok Trading Co",
      status: "paid",
      createdByMethod: "manual",
      updatedAt: now,
    });

    // ============================================
    // 6. COST OF GOODS SOLD entries
    // ============================================
    entries.push({
      businessId,
      userId,
      transactionType: "Cost of Goods Sold",
      description: "Raw materials purchase",
      originalAmount: 6000,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 6000,
      exchangeRate: 1,
      transactionDate: daysAgo(18),
      category: "direct_cost",
      vendorName: "Materials Supplier Sdn Bhd",
      status: "paid",
      createdByMethod: "manual",
      updatedAt: now,
    });

    entries.push({
      businessId,
      userId,
      transactionType: "Cost of Goods Sold",
      description: "Manufacturing supplies",
      originalAmount: 4500,
      originalCurrency: "MYR",
      homeCurrency: "MYR",
      homeCurrencyAmount: 4500,
      exchangeRate: 1,
      transactionDate: daysAgo(14),
      category: "cost_of_goods_sold",
      vendorName: "Factory Supplies Co",
      status: "paid",
      createdByMethod: "manual",
      updatedAt: now,
    });

    // ============================================
    // Insert all entries
    // ============================================
    console.log(`[Seed] Inserting ${entries.length} accounting entries...`);

    const insertedIds: string[] = [];
    for (const entry of entries) {
      const id = await ctx.db.insert("accounting_entries", entry);
      insertedIds.push(id);
      console.log(`[Seed] Inserted: ${entry.description} (${entry.transactionType}) - ${entry.originalCurrency} ${entry.originalAmount}`);
    }

    console.log(`[Seed] Successfully inserted ${insertedIds.length} entries!`);

    // Summary of what was created
    const summary = {
      totalEntries: insertedIds.length,
      overduePayments: entries.filter(e => e.status === "overdue").length,
      upcomingDue: entries.filter(e => e.dueDate && new Date(e.dueDate) > today && new Date(e.dueDate) <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)).length,
      pendingPayments: entries.filter(e => e.status === "pending").length,
      incomeEntries: entries.filter(e => e.transactionType === "Income").length,
      expenseEntries: entries.filter(e => e.transactionType === "Expense").length,
      cogsEntries: entries.filter(e => e.transactionType === "Cost of Goods Sold").length,
      currencies: [...new Set(entries.map(e => e.originalCurrency))],
      totalIncome: entries.filter(e => e.transactionType === "Income").reduce((sum, e) => sum + e.homeCurrencyAmount, 0),
      totalExpenses: entries.filter(e => e.transactionType === "Expense" || e.transactionType === "Cost of Goods Sold").reduce((sum, e) => sum + e.homeCurrencyAmount, 0),
    };

    console.log(`[Seed] Summary:`, summary);
    console.log(`[Seed] Expected insights:`);
    console.log(`  - Overdue Payments: ${summary.overduePayments} entries`);
    console.log(`  - Upcoming Due Dates: ${summary.upcomingDue} entries`);
    console.log(`  - Awaiting Payment: ${summary.pendingPayments} entries`);
    console.log(`  - Negative Profit: ${summary.totalIncome - summary.totalExpenses < 0 ? 'YES' : 'NO'} (Income: ${summary.totalIncome}, Expenses: ${summary.totalExpenses})`);
    console.log(`  - Multi-Currency Exposure: ${summary.currencies.length} currencies (${summary.currencies.join(', ')})`);

    return {
      success: true,
      insertedCount: insertedIds.length,
      summary,
      message: "Action Center test data seeded successfully! Refresh the analytics dashboard to see insights.",
    };
  },
});

/**
 * Clean up seeded test data
 * Deletes all entries created by this seed script (identified by specific descriptions)
 */
export const cleanupSeedData = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const { businessId } = args;

    // Find entries with seed-specific descriptions
    const seedDescriptions = [
      "Overdue invoice - Office Equipment",
      "Overdue invoice - Software License",
      "Rent payment - Due in 3 days",
      "Utility bill - Due in 5 days",
      "Insurance premium - Due in 6 days",
      "Marketing campaign payment",
      "Consultant fees pending",
      "Client project payment",
      "Consulting fees",
      "Major equipment purchase",
      "International supplier payment",
      "Singapore vendor invoice",
      "Thai client payment",
      "Raw materials purchase",
      "Manufacturing supplies",
    ];

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    const toDelete = entries.filter(e =>
      seedDescriptions.includes(e.description || "")
    );

    console.log(`[Cleanup] Found ${toDelete.length} seed entries to delete`);

    for (const entry of toDelete) {
      await ctx.db.delete(entry._id);
      console.log(`[Cleanup] Deleted: ${entry.description}`);
    }

    return {
      success: true,
      deletedCount: toDelete.length,
      message: `Cleaned up ${toDelete.length} seed entries`,
    };
  },
});
