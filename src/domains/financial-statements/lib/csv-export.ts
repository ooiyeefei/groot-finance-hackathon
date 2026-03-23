/**
 * CSV Export utilities for financial statements.
 *
 * Converts statement data to CSV format and triggers browser download.
 */

import type { TrialBalanceStatement } from "@/convex/lib/statement_generators/trial_balance_generator";
import type { ProfitLossStatement } from "@/convex/lib/statement_generators/profit_loss_generator";
import type { BalanceSheetStatement } from "@/convex/lib/statement_generators/balance_sheet_generator";

// Cash flow generator doesn't exist yet — define the type locally until it's created
export interface CashFlowLine {
  description: string;
  amount: number;
}

export interface CashFlowStatement {
  businessId: string;
  dateFrom: string;
  dateTo: string;
  currency: string;
  openingBalance: number;
  operatingActivities: { lines: CashFlowLine[]; total: number };
  investingActivities: { lines: CashFlowLine[]; total: number };
  financingActivities: { lines: CashFlowLine[]; total: number };
  netChange: number;
  closingBalance: number;
  balanced: boolean;
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// Generic CSV export
// ---------------------------------------------------------------------------

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

/**
 * Build a CSV string from headers + rows, create a Blob, and trigger a
 * browser download via a temporary anchor element.
 */
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: string[][]
): void {
  const csvLines: string[] = [];
  csvLines.push(headers.map(escapeCsvValue).join(","));
  for (const row of rows) {
    csvLines.push(row.map(escapeCsvValue).join(","));
  }

  const csvString = csvLines.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Report-specific exporters
// ---------------------------------------------------------------------------

export function exportTrialBalanceCsv(
  data: TrialBalanceStatement,
  businessName: string
): void {
  const headers = [
    "Account Code",
    "Account Name",
    "Account Type",
    "Debit Balance",
    "Credit Balance",
  ];

  const rows: string[][] = [];

  for (const line of data.lines) {
    rows.push([
      line.accountCode,
      line.accountName,
      line.accountType,
      formatAmount(line.debitBalance),
      formatAmount(line.creditBalance),
    ]);
  }

  // Totals row
  rows.push([
    "",
    "TOTAL",
    "",
    formatAmount(data.totalDebits),
    formatAmount(data.totalCredits),
  ]);

  const datePart = data.asOfDate.replace(/-/g, "");
  const safeName = businessName.replace(/[^a-zA-Z0-9]/g, "_");
  exportToCsv(
    `${safeName}_Trial_Balance_${datePart}.csv`,
    headers,
    rows
  );
}

export function exportProfitLossCsv(
  data: ProfitLossStatement,
  businessName: string
): void {
  const headers = ["Section", "Account Code", "Account Name", "Amount"];
  const rows: string[][] = [];

  const addSection = (
    sectionName: string,
    lines: { accountCode: string; accountName: string; amount: number }[],
    total: number
  ) => {
    for (const line of lines) {
      rows.push([
        sectionName,
        line.accountCode,
        line.accountName,
        formatAmount(line.amount),
      ]);
    }
    rows.push([sectionName, "", `Total ${sectionName}`, formatAmount(total)]);
  };

  addSection("Revenue", data.revenue.lines, data.revenue.total);
  addSection(
    "Cost of Goods Sold",
    data.costOfGoodsSold.lines,
    data.costOfGoodsSold.total
  );
  rows.push(["", "", "Gross Profit", formatAmount(data.grossProfit)]);

  addSection(
    "Operating Expenses",
    data.operatingExpenses.lines,
    data.operatingExpenses.total
  );
  rows.push(["", "", "Operating Income", formatAmount(data.operatingIncome)]);

  addSection("Other Income", data.otherIncome.lines, data.otherIncome.total);
  addSection(
    "Other Expenses",
    data.otherExpenses.lines,
    data.otherExpenses.total
  );
  rows.push(["", "", "Net Profit", formatAmount(data.netProfit)]);

  const datePart = `${data.dateFrom.replace(/-/g, "")}_${data.dateTo.replace(/-/g, "")}`;
  const safeName = businessName.replace(/[^a-zA-Z0-9]/g, "_");
  exportToCsv(
    `${safeName}_Profit_Loss_${datePart}.csv`,
    headers,
    rows
  );
}

export function exportBalanceSheetCsv(
  data: BalanceSheetStatement,
  businessName: string
): void {
  const headers = ["Section", "Account Code", "Account Name", "Balance"];
  const rows: string[][] = [];

  const addSection = (
    sectionName: string,
    lines: { accountCode: string; accountName: string; balance: number }[],
    total: number
  ) => {
    for (const line of lines) {
      rows.push([
        sectionName,
        line.accountCode,
        line.accountName,
        formatAmount(line.balance),
      ]);
    }
    rows.push([sectionName, "", `Total ${sectionName}`, formatAmount(total)]);
  };

  addSection("Current Assets", data.currentAssets.lines, data.currentAssets.total);
  addSection(
    "Non-Current Assets",
    data.nonCurrentAssets.lines,
    data.nonCurrentAssets.total
  );
  rows.push(["", "", "Total Assets", formatAmount(data.totalAssets)]);

  addSection(
    "Current Liabilities",
    data.currentLiabilities.lines,
    data.currentLiabilities.total
  );
  addSection(
    "Non-Current Liabilities",
    data.nonCurrentLiabilities.lines,
    data.nonCurrentLiabilities.total
  );
  rows.push(["", "", "Total Liabilities", formatAmount(data.totalLiabilities)]);

  addSection("Equity", data.equity.lines, data.equity.total);
  rows.push(["Equity", "", "Retained Earnings", formatAmount(data.retainedEarnings)]);
  rows.push(["", "", "Total Equity", formatAmount(data.totalEquity)]);
  rows.push([
    "",
    "",
    "Total Liabilities & Equity",
    formatAmount(data.totalLiabilitiesAndEquity),
  ]);

  const datePart = data.asOfDate.replace(/-/g, "");
  const safeName = businessName.replace(/[^a-zA-Z0-9]/g, "_");
  exportToCsv(
    `${safeName}_Balance_Sheet_${datePart}.csv`,
    headers,
    rows
  );
}

export function exportCashFlowCsv(
  data: CashFlowStatement,
  businessName: string
): void {
  const headers = ["Section", "Description", "Amount"];
  const rows: string[][] = [];

  rows.push(["", "Opening Balance", formatAmount(data.openingBalance)]);

  const addSection = (
    sectionName: string,
    lines: CashFlowLine[],
    total: number
  ) => {
    for (const line of lines) {
      rows.push([sectionName, line.description, formatAmount(line.amount)]);
    }
    rows.push([sectionName, `Total ${sectionName}`, formatAmount(total)]);
  };

  addSection(
    "Operating Activities",
    data.operatingActivities.lines,
    data.operatingActivities.total
  );
  addSection(
    "Investing Activities",
    data.investingActivities.lines,
    data.investingActivities.total
  );
  addSection(
    "Financing Activities",
    data.financingActivities.lines,
    data.financingActivities.total
  );

  rows.push(["", "Net Change", formatAmount(data.netChange)]);
  rows.push(["", "Closing Balance", formatAmount(data.closingBalance)]);

  const datePart = `${data.dateFrom.replace(/-/g, "")}_${data.dateTo.replace(/-/g, "")}`;
  const safeName = businessName.replace(/[^a-zA-Z0-9]/g, "_");
  exportToCsv(
    `${safeName}_Cash_Flow_${datePart}.csv`,
    headers,
    rows
  );
}
