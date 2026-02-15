/**
 * Payment & Debtor Functions - Convex queries and mutations
 *
 * Handles:
 * - Payment recording with multi-invoice allocations (010-ar-debtor-management)
 * - Payment reversals for corrections
 * - Payment queries (by invoice, by customer)
 * - Debtor list with aging analysis
 * - Debtor detail with running balance
 * - Debtor statement generation
 * - AR aging report
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  paymentTypeValidator,
  paymentMethodValidator,
} from "../lib/validators";
import { resolveUserByClerkId } from "../lib/resolvers";

// ============================================
// HELPER: Finance admin check (shared pattern from salesInvoices.ts)
// ============================================
async function requireFinanceAdmin(
  ctx: { db: import("../_generated/server").DatabaseReader; auth: { getUserIdentity: () => Promise<{ subject: string } | null> } },
  businessId: Id<"businesses">
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await resolveUserByClerkId(ctx.db, identity.subject);
  if (!user) throw new Error("User not found");

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") {
    throw new Error("Not a member of this business");
  }

  if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
    throw new Error("Not authorized: finance admin required");
  }

  return { user, membership };
}

// ============================================
// HELPER: Aging bucket calculation (server-side)
// ============================================
type AgingBucket = "current" | "days1to30" | "days31to60" | "days61to90" | "days90plus";

function calculateAgingBucket(dueDate: string, asOfDate: string): AgingBucket {
  const due = new Date(dueDate + "T00:00:00Z");
  const asOf = new Date(asOfDate + "T00:00:00Z");
  const diffMs = asOf.getTime() - due.getTime();
  const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "days1to30";
  if (daysOverdue <= 60) return "days31to60";
  if (daysOverdue <= 90) return "days61to90";
  return "days90plus";
}

function getTodayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Record a payment against one or more invoices.
 */
export const recordPayment = mutation({
  args: {
    businessId: v.id("businesses"),
    customerId: v.id("customers"),
    amount: v.number(),
    currency: v.string(),
    paymentDate: v.string(),
    paymentMethod: paymentMethodValidator,
    paymentReference: v.optional(v.string()),
    notes: v.optional(v.string()),
    allocations: v.array(
      v.object({
        invoiceId: v.id("sales_invoices"),
        amount: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireFinanceAdmin(ctx, args.businessId);

    // Validate amount
    if (args.amount <= 0) {
      throw new Error("Payment amount must be greater than 0");
    }

    // Validate allocations sum
    const allocationsSum = args.allocations.reduce((sum, a) => sum + a.amount, 0);
    const roundedSum = Math.round(allocationsSum * 100) / 100;
    const roundedAmount = Math.round(args.amount * 100) / 100;
    if (roundedSum !== roundedAmount) {
      throw new Error(
        `Allocation total (${roundedSum}) does not match payment amount (${roundedAmount})`
      );
    }

    // Validate each allocation
    const now = Date.now();
    for (const allocation of args.allocations) {
      if (allocation.amount <= 0) {
        throw new Error("Each allocation amount must be greater than 0");
      }

      const invoice = await ctx.db.get(allocation.invoiceId);
      if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
        throw new Error(`Invoice not found: ${allocation.invoiceId}`);
      }

      // Verify invoice belongs to the specified customer
      if (invoice.customerId !== args.customerId) {
        throw new Error(
          `Invoice ${invoice.invoiceNumber} does not belong to the specified customer`
        );
      }

      if (!["sent", "partially_paid", "overdue"].includes(invoice.status)) {
        throw new Error(
          `Invoice ${invoice.invoiceNumber} is not in a payable state (status: ${invoice.status})`
        );
      }

      if (args.currency !== invoice.currency) {
        throw new Error(
          `Currency mismatch: payment is ${args.currency} but invoice ${invoice.invoiceNumber} is ${invoice.currency}`
        );
      }

      if (allocation.amount > invoice.balanceDue + 0.01) {
        throw new Error(
          `Allocation (${allocation.amount}) exceeds balance due (${invoice.balanceDue}) for invoice ${invoice.invoiceNumber}`
        );
      }
    }

    // Create payment record
    const paymentId = await ctx.db.insert("payments", {
      businessId: args.businessId,
      customerId: args.customerId,
      userId: user._id,
      type: "payment",
      amount: roundedAmount,
      currency: args.currency,
      paymentDate: args.paymentDate,
      paymentMethod: args.paymentMethod,
      paymentReference: args.paymentReference,
      notes: args.notes,
      allocations: args.allocations.map((a) => ({
        invoiceId: a.invoiceId,
        amount: Math.round(a.amount * 100) / 100,
        allocatedAt: now,
      })),
    });

    // Update each invoice
    for (const allocation of args.allocations) {
      const invoice = await ctx.db.get(allocation.invoiceId);
      if (!invoice) continue;

      const newAmountPaid = Math.round(((invoice.amountPaid ?? 0) + allocation.amount) * 100) / 100;
      const newBalanceDue = Math.max(0, Math.round((invoice.totalAmount - newAmountPaid) * 100) / 100);
      const newStatus = newBalanceDue <= 0 ? "paid" : "partially_paid";

      const updates: Record<string, unknown> = {
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        status: newStatus,
        updatedAt: now,
      };

      if (newStatus === "paid") {
        updates.paidAt = args.paymentDate;
      }

      await ctx.db.patch(allocation.invoiceId, updates);

      // Update linked accounting entry
      if (invoice.accountingEntryId) {
        try {
          const entryId = invoice.accountingEntryId as Id<"accounting_entries">;
          const entry = await ctx.db.get(entryId);
          if (entry) {
            await ctx.db.patch(entryId, {
              status: newStatus === "paid" ? "paid" : "pending",
              updatedAt: now,
            });
          }
        } catch {
          // Accounting entry may not exist
        }
      }
    }

    return paymentId;
  },
});

/**
 * Record a reversal to correct a previously recorded payment.
 */
export const recordReversal = mutation({
  args: {
    businessId: v.id("businesses"),
    originalPaymentId: v.id("payments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireFinanceAdmin(ctx, args.businessId);

    // Validate original payment
    const originalPayment = await ctx.db.get(args.originalPaymentId);
    if (!originalPayment || originalPayment.businessId !== args.businessId || originalPayment.deletedAt) {
      throw new Error("Original payment not found");
    }

    if (originalPayment.type !== "payment") {
      throw new Error("Can only reverse a payment (not a reversal)");
    }

    // Check for existing reversal
    const existingReversal = await ctx.db
      .query("payments")
      .withIndex("by_reversesPaymentId", (q) =>
        q.eq("reversesPaymentId", args.originalPaymentId)
      )
      .first();

    if (existingReversal) {
      throw new Error("This payment has already been reversed");
    }

    const now = Date.now();

    // Create reversal record
    const reversalId = await ctx.db.insert("payments", {
      businessId: args.businessId,
      customerId: originalPayment.customerId,
      userId: user._id,
      type: "reversal",
      amount: originalPayment.amount,
      currency: originalPayment.currency,
      paymentDate: getTodayISO(),
      paymentMethod: originalPayment.paymentMethod,
      notes: args.reason ?? `Reversal of payment ${args.originalPaymentId}`,
      reversesPaymentId: args.originalPaymentId,
      allocations: originalPayment.allocations.map((a) => ({
        invoiceId: a.invoiceId,
        amount: a.amount,
        allocatedAt: now,
      })),
    });

    // Restore each invoice's balance
    for (const allocation of originalPayment.allocations) {
      const invoice = await ctx.db.get(allocation.invoiceId);
      if (!invoice) continue;

      const newAmountPaid = Math.max(0, Math.round(((invoice.amountPaid ?? 0) - allocation.amount) * 100) / 100);
      const newBalanceDue = Math.round((invoice.totalAmount - newAmountPaid) * 100) / 100;

      // Determine reverted status
      let newStatus: "sent" | "overdue" | "partially_paid";
      if (newAmountPaid <= 0) {
        // Check if overdue
        const today = getTodayISO();
        newStatus = invoice.dueDate < today ? "overdue" : "sent";
      } else {
        newStatus = "partially_paid";
      }

      await ctx.db.patch(allocation.invoiceId, {
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        status: newStatus,
        paidAt: undefined,
        updatedAt: now,
      });

      // Revert accounting entry
      if (invoice.accountingEntryId) {
        try {
          const entryId = invoice.accountingEntryId as Id<"accounting_entries">;
          const entry = await ctx.db.get(entryId);
          if (entry) {
            await ctx.db.patch(entryId, {
              status: "pending",
              updatedAt: now,
            });
          }
        } catch {
          // Accounting entry may not exist
        }
      }
    }

    return reversalId;
  },
});

// ============================================
// PAYMENT QUERIES
// ============================================

/**
 * Get all payments allocated to a specific invoice.
 */
export const listByInvoice = query({
  args: {
    businessId: v.id("businesses"),
    invoiceId: v.id("sales_invoices"),
  },
  handler: async (ctx, args) => {
    const allPayments = await ctx.db
      .query("payments")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const payments = allPayments
      .filter((p) => !p.deletedAt && p.allocations.some((a) => a.invoiceId === args.invoiceId))
      .map((p) => {
        const allocation = p.allocations.find((a) => a.invoiceId === args.invoiceId);
        return {
          _id: p._id,
          type: p.type,
          amount: p.amount,
          allocatedAmount: allocation?.amount ?? 0,
          currency: p.currency,
          paymentDate: p.paymentDate,
          paymentMethod: p.paymentMethod,
          paymentReference: p.paymentReference,
          notes: p.notes,
          reversesPaymentId: p.reversesPaymentId,
          _creationTime: p._creationTime,
        };
      })
      .sort((a, b) => a._creationTime - b._creationTime);

    return { payments };
  },
});

/**
 * Get all payments from a specific customer within a date range.
 */
export const listByCustomer = query({
  args: {
    businessId: v.id("businesses"),
    customerId: v.id("customers"),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const allPayments = await ctx.db
      .query("payments")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", args.businessId).eq("customerId", args.customerId)
      )
      .collect();

    let payments = allPayments.filter((p) => !p.deletedAt);

    if (args.dateFrom) {
      payments = payments.filter((p) => p.paymentDate >= args.dateFrom!);
    }
    if (args.dateTo) {
      payments = payments.filter((p) => p.paymentDate <= args.dateTo!);
    }

    payments.sort((a, b) => (a.paymentDate > b.paymentDate ? 1 : -1));

    const totalPaid = payments
      .filter((p) => p.type === "payment")
      .reduce((sum, p) => sum + p.amount, 0);

    const totalReversed = payments
      .filter((p) => p.type === "reversal")
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      payments,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalReversed: Math.round(totalReversed * 100) / 100,
    };
  },
});

// ============================================
// DEBTOR QUERIES
// ============================================

/**
 * Get all customers with outstanding invoices (debtor list with aging).
 */
export const getDebtorList = query({
  args: {
    businessId: v.id("businesses"),
    overdueOnly: v.optional(v.boolean()),
    minOutstanding: v.optional(v.number()),
    currency: v.optional(v.string()),
    sortField: v.optional(v.string()),
    sortDirection: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const today = getTodayISO();

    // Get all invoices with outstanding balance
    const invoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const outstandingInvoices = invoices.filter(
      (inv) => !inv.deletedAt && inv.balanceDue > 0 && ["sent", "partially_paid", "overdue"].includes(inv.status)
    );

    // Group by customer + currency
    const debtorMap = new Map<
      string,
      {
        customerId?: Id<"customers">;
        customerName: string;
        currency: string;
        invoices: Array<{ dueDate: string; balanceDue: number }>;
      }
    >();

    for (const inv of outstandingInvoices) {
      if (args.currency && inv.currency !== args.currency) continue;

      // Use customerId if available, fall back to snapshot email for grouping
      const customerKey = inv.customerId ?? `snapshot_${inv.customerSnapshot.email}`;
      const key = `${customerKey}_${inv.currency}`;
      if (!debtorMap.has(key)) {
        debtorMap.set(key, {
          customerId: inv.customerId ?? undefined,
          customerName: inv.customerSnapshot.businessName,
          currency: inv.currency,
          invoices: [],
        });
      }
      debtorMap.get(key)!.invoices.push({
        dueDate: inv.dueDate,
        balanceDue: inv.balanceDue,
      });
    }

    // Compute aging per debtor
    type AgingBuckets = { current: number; days1to30: number; days31to60: number; days61to90: number; days90plus: number };
    const debtors: Array<{
      customerId?: Id<"customers">;
      customerName: string;
      openInvoiceCount: number;
      totalOutstanding: number;
      currency: string;
      oldestOverdueDays: number;
      aging: AgingBuckets;
    }> = [];

    for (const [, data] of debtorMap) {
      const aging: AgingBuckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
      let oldestOverdueDays = 0;

      for (const inv of data.invoices) {
        const bucket = calculateAgingBucket(inv.dueDate, today);
        aging[bucket as keyof AgingBuckets] += inv.balanceDue;

        const daysOverdue = Math.max(
          0,
          Math.floor(
            (new Date(today + "T00:00:00Z").getTime() - new Date(inv.dueDate + "T00:00:00Z").getTime()) /
              (1000 * 60 * 60 * 24)
          )
        );
        if (daysOverdue > oldestOverdueDays) {
          oldestOverdueDays = daysOverdue;
        }
      }

      // Round
      for (const key of Object.keys(aging) as (keyof AgingBuckets)[]) {
        aging[key] = Math.round(aging[key] * 100) / 100;
      }

      const totalOutstanding = Math.round(
        data.invoices.reduce((sum, inv) => sum + inv.balanceDue, 0) * 100
      ) / 100;

      // Apply filters
      if (args.overdueOnly && oldestOverdueDays === 0) continue;
      if (args.minOutstanding && totalOutstanding < args.minOutstanding) continue;

      debtors.push({
        customerId: data.customerId,
        customerName: data.customerName,
        openInvoiceCount: data.invoices.length,
        totalOutstanding,
        currency: data.currency,
        oldestOverdueDays,
        aging,
      });
    }

    // Sort
    const sortField = args.sortField ?? "outstanding";
    const sortDir = args.sortDirection === "asc" ? 1 : -1;

    debtors.sort((a, b) => {
      if (sortField === "customerName") {
        return sortDir * a.customerName.localeCompare(b.customerName);
      }
      if (sortField === "daysOverdue") {
        return sortDir * (a.oldestOverdueDays - b.oldestOverdueDays);
      }
      return sortDir * (a.totalOutstanding - b.totalOutstanding);
    });

    // Summary
    const summaryAging: AgingBuckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    let summaryTotal = 0;

    for (const d of debtors) {
      summaryAging.current += d.aging.current;
      summaryAging.days1to30 += d.aging.days1to30;
      summaryAging.days31to60 += d.aging.days31to60;
      summaryAging.days61to90 += d.aging.days61to90;
      summaryAging.days90plus += d.aging.days90plus;
      summaryTotal += d.totalOutstanding;
    }

    return {
      debtors,
      summary: {
        totalDebtors: debtors.length,
        totalOutstanding: Math.round(summaryTotal * 100) / 100,
        currency: args.currency ?? debtors[0]?.currency ?? "",
        aging: {
          current: Math.round(summaryAging.current * 100) / 100,
          days1to30: Math.round(summaryAging.days1to30 * 100) / 100,
          days31to60: Math.round(summaryAging.days31to60 * 100) / 100,
          days61to90: Math.round(summaryAging.days61to90 * 100) / 100,
          days90plus: Math.round(summaryAging.days90plus * 100) / 100,
        },
      },
    };
  },
});

/**
 * Get full debtor detail with invoice + payment history and running balance.
 */
export const getDebtorDetail = query({
  args: {
    businessId: v.id("businesses"),
    customerId: v.id("customers"),
  },
  handler: async (ctx, args) => {
    // Get customer
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.businessId !== args.businessId) {
      throw new Error("Customer not found");
    }

    const today = getTodayISO();

    // Get all invoices for this customer
    const allInvoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", args.businessId).eq("customerId", args.customerId)
      )
      .collect();

    const invoices = allInvoices.filter((inv) => !inv.deletedAt);

    // Get all payments for this customer
    const allPayments = await ctx.db
      .query("payments")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", args.businessId).eq("customerId", args.customerId)
      )
      .collect();

    const payments = allPayments.filter((p) => !p.deletedAt);

    // Build invoice list with per-invoice payment history
    const invoiceList = invoices
      .sort((a, b) => (b.invoiceDate > a.invoiceDate ? 1 : -1))
      .map((inv) => {
        const invoicePayments = payments
          .filter((p) => p.allocations.some((a) => a.invoiceId === inv._id))
          .map((p) => {
            const allocation = p.allocations.find((a) => a.invoiceId === inv._id);
            return {
              _id: p._id,
              type: p.type as "payment" | "reversal",
              amount: p.amount,
              allocatedAmount: allocation?.amount ?? 0,
              paymentDate: p.paymentDate,
              paymentMethod: p.paymentMethod,
              paymentReference: p.paymentReference,
              reversesPaymentId: p.reversesPaymentId,
              _creationTime: p._creationTime,
            };
          })
          .sort((a, b) => a._creationTime - b._creationTime);

        return {
          _id: inv._id,
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          totalAmount: inv.totalAmount,
          amountPaid: inv.amountPaid ?? 0,
          balanceDue: inv.balanceDue,
          status: inv.status,
          currency: inv.currency,
          payments: invoicePayments,
        };
      });

    // Summary
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.amountPaid ?? 0), 0);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balanceDue, 0);
    const overdueCount = invoices.filter(
      (inv) => inv.balanceDue > 0 && inv.dueDate < today
    ).length;

    // Running balance (chronological)
    type BalanceEntry = {
      date: string;
      type: "invoice" | "payment" | "reversal";
      description: string;
      debit: number;
      credit: number;
      balance: number;
      referenceId: string;
    };

    const entries: Omit<BalanceEntry, "balance">[] = [];

    for (const inv of invoices) {
      entries.push({
        date: inv.invoiceDate,
        type: "invoice",
        description: `Invoice ${inv.invoiceNumber}`,
        debit: inv.totalAmount,
        credit: 0,
        referenceId: inv._id,
      });
    }

    for (const p of payments) {
      entries.push({
        date: p.paymentDate,
        type: p.type as "payment" | "reversal",
        description:
          p.type === "reversal"
            ? `Reversal - ${p.paymentMethod}`
            : `Payment - ${p.paymentMethod}`,
        debit: p.type === "reversal" ? p.amount : 0,
        credit: p.type === "payment" ? p.amount : 0,
        referenceId: p._id,
      });
    }

    // Sort chronologically, invoices before payments on same date
    entries.sort((a, b) => {
      if (a.date !== b.date) return a.date > b.date ? 1 : -1;
      if (a.type === "invoice" && b.type !== "invoice") return -1;
      if (a.type !== "invoice" && b.type === "invoice") return 1;
      return 0;
    });

    let runningBal = 0;
    const runningBalance: BalanceEntry[] = entries.map((entry) => {
      runningBal += entry.debit - entry.credit;
      return {
        ...entry,
        balance: Math.round(runningBal * 100) / 100,
      };
    });

    return {
      customer: {
        _id: customer._id,
        name: customer.businessName,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
      },
      summary: {
        totalInvoiced: Math.round(totalInvoiced * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        overdueCount,
        currency: invoices[0]?.currency ?? "",
      },
      invoices: invoiceList,
      runningBalance,
    };
  },
});

/**
 * Generate statement data for a specific debtor and date range.
 */
export const getDebtorStatement = query({
  args: {
    businessId: v.id("businesses"),
    customerId: v.id("customers"),
    dateFrom: v.string(),
    dateTo: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.dateFrom > args.dateTo) {
      throw new Error("dateFrom must be before dateTo");
    }

    // Get customer
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.businessId !== args.businessId) {
      throw new Error("Customer not found");
    }

    // Get business
    const business = await ctx.db.get(args.businessId);

    // Get all invoices for this customer
    const allInvoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", args.businessId).eq("customerId", args.customerId)
      )
      .collect();

    const invoices = allInvoices.filter((inv) => !inv.deletedAt);

    // Get all payments for this customer
    const allPayments = await ctx.db
      .query("payments")
      .withIndex("by_businessId_customerId", (q) =>
        q.eq("businessId", args.businessId).eq("customerId", args.customerId)
      )
      .collect();

    const payments = allPayments.filter((p) => !p.deletedAt);

    // Calculate opening balance: outstanding before dateFrom
    let openingBalance = 0;

    // All invoices issued before dateFrom contribute to opening balance
    for (const inv of invoices) {
      if (inv.invoiceDate < args.dateFrom) {
        openingBalance += inv.totalAmount;
      }
    }

    // All payments before dateFrom reduce opening balance
    for (const p of payments) {
      if (p.paymentDate < args.dateFrom) {
        if (p.type === "payment") {
          openingBalance -= p.amount;
        } else {
          openingBalance += p.amount; // Reversal restores balance
        }
      }
    }

    openingBalance = Math.round(openingBalance * 100) / 100;

    // Build transaction list for the period
    type TxEntry = {
      date: string;
      type: "invoice" | "payment" | "reversal";
      reference: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    };

    const rawEntries: Omit<TxEntry, "balance">[] = [];

    for (const inv of invoices) {
      if (inv.invoiceDate >= args.dateFrom && inv.invoiceDate <= args.dateTo) {
        rawEntries.push({
          date: inv.invoiceDate,
          type: "invoice",
          reference: inv.invoiceNumber,
          description: `Invoice issued`,
          debit: inv.totalAmount,
          credit: 0,
        });
      }
    }

    for (const p of payments) {
      if (p.paymentDate >= args.dateFrom && p.paymentDate <= args.dateTo) {
        const methodLabel = p.paymentMethod.replace(/_/g, " ");
        rawEntries.push({
          date: p.paymentDate,
          type: p.type as "payment" | "reversal",
          reference: p.paymentReference ?? p._id,
          description:
            p.type === "reversal"
              ? `Reversal - ${methodLabel}`
              : `Payment received - ${methodLabel}`,
          debit: p.type === "reversal" ? p.amount : 0,
          credit: p.type === "payment" ? p.amount : 0,
        });
      }
    }

    // Sort: chronological, invoices before payments on same date
    rawEntries.sort((a, b) => {
      if (a.date !== b.date) return a.date > b.date ? 1 : -1;
      if (a.type === "invoice" && b.type !== "invoice") return -1;
      if (a.type !== "invoice" && b.type === "invoice") return 1;
      return 0;
    });

    // Build running balance
    let balance = openingBalance;
    const transactions: TxEntry[] = rawEntries.map((entry) => {
      balance = Math.round((balance + entry.debit - entry.credit) * 100) / 100;
      return { ...entry, balance };
    });

    const totalDebits = Math.round(
      rawEntries.reduce((sum, e) => sum + e.debit, 0) * 100
    ) / 100;
    const totalCredits = Math.round(
      rawEntries.reduce((sum, e) => sum + e.credit, 0) * 100
    ) / 100;
    const closingBalance = Math.round((openingBalance + totalDebits - totalCredits) * 100) / 100;

    return {
      customer: {
        _id: customer._id,
        name: customer.businessName,
        email: customer.email,
        address: customer.address,
      },
      business: {
        name: business?.invoiceSettings?.companyName ?? business?.name ?? "",
        address: business?.invoiceSettings?.companyAddress ?? business?.address,
        registrationNumber: business?.invoiceSettings?.registrationNumber,
      },
      period: {
        from: args.dateFrom,
        to: args.dateTo,
      },
      openingBalance,
      closingBalance,
      currency: invoices[0]?.currency ?? "",
      transactions,
      totals: {
        totalDebits,
        totalCredits,
      },
    };
  },
});

/**
 * Generate AR aging report with per-debtor breakdown.
 */
export const getAgingReport = query({
  args: {
    businessId: v.id("businesses"),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const asOfDate = args.asOfDate ?? getTodayISO();

    // Get all invoices with outstanding balance
    const allInvoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const outstandingInvoices = allInvoices.filter(
      (inv) =>
        !inv.deletedAt &&
        inv.balanceDue > 0 &&
        ["sent", "partially_paid", "overdue"].includes(inv.status)
    );

    // Group by customer + currency (prevents mixing different currencies under same customer)
    const customerMap = new Map<
      string,
      {
        customerId?: Id<"customers">;
        customerName: string;
        currency: string;
        current: number;
        days1to30: number;
        days31to60: number;
        days61to90: number;
        days90plus: number;
        total: number;
      }
    >();

    for (const inv of outstandingInvoices) {
      // Use customerId if available, fall back to snapshot email for grouping
      const customerKey = inv.customerId ?? `snapshot_${inv.customerSnapshot.email}`;
      const key = `${customerKey}_${inv.currency}`;
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customerId: inv.customerId ?? undefined,
          customerName: inv.customerSnapshot.businessName,
          currency: inv.currency,
          current: 0,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          days90plus: 0,
          total: 0,
        });
      }

      const debtor = customerMap.get(key)!;
      const bucket = calculateAgingBucket(inv.dueDate, asOfDate);
      // Safe: bucket is always one of the numeric aging fields (current, days1to30, etc.)
      (debtor as unknown as Record<string, number>)[bucket] += inv.balanceDue;
      debtor.total += inv.balanceDue;
    }

    // Build result
    const debtors = Array.from(customerMap.values())
      .map((d) => ({
        ...d,
        current: Math.round(d.current * 100) / 100,
        days1to30: Math.round(d.days1to30 * 100) / 100,
        days31to60: Math.round(d.days31to60 * 100) / 100,
        days61to90: Math.round(d.days61to90 * 100) / 100,
        days90plus: Math.round(d.days90plus * 100) / 100,
        total: Math.round(d.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    // Summary
    const summary = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90plus: 0,
      total: 0,
    };

    for (const d of debtors) {
      summary.current += d.current;
      summary.days1to30 += d.days1to30;
      summary.days31to60 += d.days31to60;
      summary.days61to90 += d.days61to90;
      summary.days90plus += d.days90plus;
      summary.total += d.total;
    }

    summary.current = Math.round(summary.current * 100) / 100;
    summary.days1to30 = Math.round(summary.days1to30 * 100) / 100;
    summary.days31to60 = Math.round(summary.days31to60 * 100) / 100;
    summary.days61to90 = Math.round(summary.days61to90 * 100) / 100;
    summary.days90plus = Math.round(summary.days90plus * 100) / 100;
    summary.total = Math.round(summary.total * 100) / 100;

    return {
      asOfDate,
      currency: outstandingInvoices[0]?.currency ?? "",
      summary,
      debtors,
    };
  },
});
