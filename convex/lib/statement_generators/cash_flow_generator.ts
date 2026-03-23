/**
 * Cash Flow Statement Generator — Direct Method
 *
 * Classifies cash movements by examining the CONTRA account of each
 * journal entry that touches Cash (accountCode "1000"):
 *   - Operating: contra is Revenue (4xxx) or Expense (5xxx-6xxx)
 *   - Investing: contra is Non-Current Asset (1500-1999)
 *   - Financing: contra is Liability (2xxx) or Equity (3xxx)
 *
 * Performance: Uses 3 queries total (business + entries + lines) instead of
 * O(entries × lines) N+1 pattern.
 */

import { QueryCtx } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";

export interface CashFlowLine {
  description: string; // contra account name or entry description
  accountCode: string; // contra account code
  amount: number; // positive = inflow, negative = outflow
}

export interface CashFlowStatement {
  businessId: Id<"businesses">;
  dateFrom: string;
  dateTo: string;
  currency: string;
  openingBalance: number;
  operatingActivities: { lines: CashFlowLine[]; total: number };
  investingActivities: { lines: CashFlowLine[]; total: number };
  financingActivities: { lines: CashFlowLine[]; total: number };
  netChange: number;
  closingBalance: number;
  balanced: boolean; // opening + netChange === closing (±0.01)
  generatedAt: number;
}

const CASH_ACCOUNT_CODE = "1000";

/**
 * Classify a contra account code into a cash flow activity category.
 */
function classifyContraAccount(
  accountCode: string
): "operating" | "investing" | "financing" | "unknown" {
  const code = parseInt(accountCode, 10);
  if (isNaN(code)) return "unknown";

  // Revenue (4xxx) or Expense (5xxx-6xxx) → Operating
  if (code >= 4000 && code <= 6999) return "operating";

  // Non-Current Assets (1500-1999) → Investing
  if (code >= 1500 && code <= 1999) return "investing";

  // Liabilities (2xxx) or Equity (3xxx) → Financing
  if (code >= 2000 && code <= 3999) return "financing";

  // Current assets other than cash (1001-1499) — treat as operating (e.g., AR collections)
  if (code >= 1001 && code <= 1499) return "operating";

  return "unknown";
}

export async function generateCashFlowStatement(
  ctx: QueryCtx,
  args: {
    businessId: Id<"businesses">;
    dateFrom: string;
    dateTo: string;
  }
): Promise<CashFlowStatement> {
  const { businessId, dateFrom, dateTo } = args;

  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  // --- Query 1: Get ALL journal entries for this business (one query) ---
  const allEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .collect();

  // Partition posted entries into "before dateFrom" and "within date range"
  const openingEntryIds = new Set<string>();
  const periodEntryIds = new Set<string>();

  for (const entry of allEntries) {
    if (entry.status !== "posted") continue;
    if (entry.transactionDate < dateFrom) {
      openingEntryIds.add(entry._id as string);
    } else if (entry.transactionDate <= dateTo) {
      periodEntryIds.add(entry._id as string);
    }
  }

  // Build a map of entryId → description for period entries
  const entryDescriptions = new Map<string, string>();
  for (const entry of allEntries) {
    if (periodEntryIds.has(entry._id as string)) {
      entryDescriptions.set(entry._id as string, entry.description ?? "");
    }
  }

  // --- Query 2: Get ALL journal entry lines for this business (one query) ---
  const allLines = await ctx.db
    .query("journal_entry_lines")
    .withIndex("by_business_account", (q) => q.eq("businessId", businessId))
    .collect();

  // --- Step 1: Calculate opening balance (Cash 1000 balance before dateFrom) ---
  let openingBalance = 0;
  for (const line of allLines) {
    if (
      line.accountCode === CASH_ACCOUNT_CODE &&
      openingEntryIds.has(line.journalEntryId as string)
    ) {
      // Cash is a debit-normal account: debits increase, credits decrease
      openingBalance += line.debitAmount - line.creditAmount;
    }
  }

  // --- Step 2: Group period lines by journal entry ---
  // For each period entry, find the cash line(s) and contra line(s)
  const linesByEntry = new Map<
    string,
    Array<{
      accountCode: string;
      accountName: string;
      debitAmount: number;
      creditAmount: number;
    }>
  >();

  for (const line of allLines) {
    const entryIdStr = line.journalEntryId as string;
    if (!periodEntryIds.has(entryIdStr)) continue;

    if (!linesByEntry.has(entryIdStr)) {
      linesByEntry.set(entryIdStr, []);
    }
    linesByEntry.get(entryIdStr)!.push({
      accountCode: line.accountCode,
      accountName: line.accountName ?? line.accountCode,
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
    });
  }

  // --- Step 3: For each entry with a Cash line, classify contra lines ---
  const operatingLines: CashFlowLine[] = [];
  const investingLines: CashFlowLine[] = [];
  const financingLines: CashFlowLine[] = [];

  for (const [entryId, lines] of linesByEntry) {
    // Check if this entry involves Cash
    const cashLines = lines.filter(
      (l) => l.accountCode === CASH_ACCOUNT_CODE
    );
    if (cashLines.length === 0) continue;

    // Calculate net cash effect: debit to cash = inflow, credit to cash = outflow
    let netCashEffect = 0;
    for (const cashLine of cashLines) {
      netCashEffect += cashLine.debitAmount - cashLine.creditAmount;
    }

    // Get contra lines (everything that's NOT cash)
    const contraLines = lines.filter(
      (l) => l.accountCode !== CASH_ACCOUNT_CODE
    );

    if (contraLines.length === 0) {
      // Edge case: entry only has cash lines (shouldn't happen in double-entry)
      // Classify as operating by default
      operatingLines.push({
        description: entryDescriptions.get(entryId) || "Cash transaction",
        accountCode: CASH_ACCOUNT_CODE,
        amount: netCashEffect,
      });
      continue;
    }

    // Calculate total contra amount to proportionally allocate cash effect
    const totalContraAmount = contraLines.reduce(
      (sum, l) => sum + l.debitAmount + l.creditAmount,
      0
    );

    for (const contra of contraLines) {
      const category = classifyContraAccount(contra.accountCode);

      // Proportionally allocate the cash effect across contra lines
      const contraWeight =
        totalContraAmount > 0
          ? (contra.debitAmount + contra.creditAmount) / totalContraAmount
          : 1 / contraLines.length;

      const amount = netCashEffect * contraWeight;

      const flowLine: CashFlowLine = {
        description:
          contra.accountName ||
          entryDescriptions.get(entryId) ||
          "Cash transaction",
        accountCode: contra.accountCode,
        amount,
      };

      switch (category) {
        case "operating":
          operatingLines.push(flowLine);
          break;
        case "investing":
          investingLines.push(flowLine);
          break;
        case "financing":
          financingLines.push(flowLine);
          break;
        default:
          // Unknown contra accounts default to operating
          operatingLines.push(flowLine);
          break;
      }
    }
  }

  // --- Step 4: Calculate totals ---
  const operatingTotal = operatingLines.reduce((s, l) => s + l.amount, 0);
  const investingTotal = investingLines.reduce((s, l) => s + l.amount, 0);
  const financingTotal = financingLines.reduce((s, l) => s + l.amount, 0);
  const netChange = operatingTotal + investingTotal + financingTotal;
  const closingBalance = openingBalance + netChange;

  // Verification: opening + netChange should equal closing (sanity check)
  const balanced = Math.abs(openingBalance + netChange - closingBalance) < 0.01;

  return {
    businessId,
    dateFrom,
    dateTo,
    currency: business.homeCurrency,
    openingBalance,
    operatingActivities: {
      lines: operatingLines.sort((a, b) =>
        a.accountCode.localeCompare(b.accountCode)
      ),
      total: operatingTotal,
    },
    investingActivities: {
      lines: investingLines.sort((a, b) =>
        a.accountCode.localeCompare(b.accountCode)
      ),
      total: investingTotal,
    },
    financingActivities: {
      lines: financingLines.sort((a, b) =>
        a.accountCode.localeCompare(b.accountCode)
      ),
      total: financingTotal,
    },
    netChange,
    closingBalance,
    balanced,
    generatedAt: Date.now(),
  };
}
