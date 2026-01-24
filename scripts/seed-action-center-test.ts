/**
 * Seed Test Data for Action Center Testing
 *
 * Run with: npx convex run scripts/seed-action-center-test
 *
 * This creates test data to trigger various detection algorithms:
 * 1. Anomaly Detection - Large expense transactions
 * 2. Vendor Concentration - Multiple transactions to same vendor
 * 3. Cash Flow Warning - High expense to income ratio
 * 4. Duplicate Detection - Same amount/vendor/date transactions
 * 5. Uncategorized Transactions - Missing categories
 */

import { mutation } from "../convex/_generated/server";
import { v } from "convex/values";

// Helper to generate dates
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
};

export const seedTestData = mutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { businessId, userId } = args;

    console.log("🌱 Seeding test data for Action Center...");

    // 1. ANOMALY DETECTION TEST
    // Create normal expenses first (to establish baseline)
    console.log("📊 Creating baseline expenses for anomaly detection...");
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("accounting_entries", {
        businessId,
        userId,
        transactionType: "Expense",
        category: "Office Supplies",
        originalAmount: 50 + Math.random() * 50, // $50-100 range
        originalCurrency: "USD",
        homeCurrencyAmount: 50 + Math.random() * 50,
        homeCurrency: "USD",
        transactionDate: daysAgo(30 + i),
        description: `Normal office supply purchase ${i + 1}`,
        vendorName: "Office Depot",
        status: "paid",
      });
    }

    // Create anomaly: Large expense (should trigger >2σ alert)
    console.log("⚠️ Creating anomaly transaction (5x normal)...");
    await ctx.db.insert("accounting_entries", {
      businessId,
      userId,
      transactionType: "Expense",
      category: "Office Supplies",
      originalAmount: 500, // 5x the normal average
      originalCurrency: "USD",
      homeCurrencyAmount: 500,
      homeCurrency: "USD",
      transactionDate: daysAgo(2), // Recent
      description: "Large office equipment purchase - ANOMALY TEST",
      vendorName: "Office Depot",
      status: "paid",
    });

    // 2. VENDOR CONCENTRATION TEST
    // Create expenses to single vendor (>50% of category)
    console.log("🏢 Creating vendor concentration data...");
    for (let i = 0; i < 8; i++) {
      await ctx.db.insert("accounting_entries", {
        businessId,
        userId,
        transactionType: "Expense",
        category: "Software",
        originalAmount: 200,
        originalCurrency: "USD",
        homeCurrencyAmount: 200,
        homeCurrency: "USD",
        transactionDate: daysAgo(10 + i * 5),
        description: `Software subscription ${i + 1}`,
        vendorName: "Acme Software Inc", // Single vendor
        status: "paid",
      });
    }
    // Add small amount to different vendor
    await ctx.db.insert("accounting_entries", {
      businessId,
      userId,
      transactionType: "Expense",
      category: "Software",
      originalAmount: 50,
      originalCurrency: "USD",
      homeCurrencyAmount: 50,
      homeCurrency: "USD",
      transactionDate: daysAgo(5),
      description: "Other software tool",
      vendorName: "Other Vendor",
      status: "paid",
    });

    // 3. CASH FLOW WARNING TEST
    // Create high expenses vs low income
    console.log("💰 Creating cash flow imbalance...");
    // Low income
    await ctx.db.insert("accounting_entries", {
      businessId,
      userId,
      transactionType: "Income",
      category: "Sales",
      originalAmount: 1000,
      originalCurrency: "USD",
      homeCurrencyAmount: 1000,
      homeCurrency: "USD",
      transactionDate: daysAgo(15),
      description: "Monthly sales income",
      status: "paid",
    });
    // High expenses (1.5x income)
    await ctx.db.insert("accounting_entries", {
      businessId,
      userId,
      transactionType: "Expense",
      category: "Operations",
      originalAmount: 1500,
      originalCurrency: "USD",
      homeCurrencyAmount: 1500,
      homeCurrency: "USD",
      transactionDate: daysAgo(10),
      description: "Operations expense",
      vendorName: "Operations Vendor",
      status: "paid",
    });

    // 4. DUPLICATE DETECTION TEST
    // Same amount, vendor, date
    console.log("📋 Creating potential duplicate transactions...");
    await ctx.db.insert("accounting_entries", {
      businessId,
      userId,
      transactionType: "Expense",
      category: "Travel",
      originalAmount: 1500,
      originalCurrency: "USD",
      homeCurrencyAmount: 1500,
      homeCurrency: "USD",
      transactionDate: daysAgo(5),
      description: "Conference travel booking",
      vendorName: "Travel Agency XYZ",
      status: "paid",
    });
    await ctx.db.insert("accounting_entries", {
      businessId,
      userId,
      transactionType: "Expense",
      category: "Travel",
      originalAmount: 1500, // Same amount
      originalCurrency: "USD",
      homeCurrencyAmount: 1500,
      homeCurrency: "USD",
      transactionDate: daysAgo(5), // Same date
      description: "Conference travel booking duplicate",
      vendorName: "Travel Agency XYZ", // Same vendor
      status: "paid",
    });

    // 5. UNCATEGORIZED TRANSACTIONS TEST
    console.log("🏷️ Creating uncategorized transactions...");
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert("accounting_entries", {
        businessId,
        userId,
        transactionType: "Expense",
        originalAmount: 100 + i * 20,
        originalCurrency: "USD",
        homeCurrencyAmount: 100 + i * 20,
        homeCurrency: "USD",
        transactionDate: daysAgo(3 + i),
        description: `Uncategorized expense ${i + 1}`,
        vendorName: "Unknown Vendor",
        status: "paid",
        // No category set!
      });
    }

    // 6. PAYMENT DUE DEADLINE TEST
    console.log("📅 Creating upcoming payment due...");
    const dueDateSoon = new Date();
    dueDateSoon.setDate(dueDateSoon.getDate() + 5); // Due in 5 days
    await ctx.db.insert("accounting_entries", {
      businessId,
      userId,
      transactionType: "Expense",
      category: "Bills",
      originalAmount: 2000,
      originalCurrency: "USD",
      homeCurrencyAmount: 2000,
      homeCurrency: "USD",
      transactionDate: daysAgo(20),
      dueDate: dueDateSoon.toISOString().split("T")[0],
      description: "Quarterly rent payment - DUE SOON",
      vendorName: "Landlord LLC",
      status: "pending", // Not paid yet
    });

    console.log("✅ Test data seeded successfully!");
    console.log("");
    console.log("Now run the proactive analysis to generate insights:");
    console.log("npx convex run functions/actionCenterJobs:runProactiveAnalysis");

    return { success: true };
  },
});
