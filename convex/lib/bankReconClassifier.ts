/**
 * Bank Recon Classifier Engine — Tier 1 Rule-Based
 *
 * Keyword matching against bank_recon_classification_rules table.
 * Same pattern as feeClassifier.ts for fee classification.
 */

import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export const DEFAULT_BANK_RECON_RULES: Array<{
  keyword: string;
  debitAccountCode: string;
  debitAccountName: string;
  creditAccountCode: string;
  creditAccountName: string;
  platform: string;
}> = [
  // Bank charges (debit expense, credit cash)
  { keyword: "service charge", debitAccountCode: "6100", debitAccountName: "Bank Charges", creditAccountCode: "BANK_GL", creditAccountName: "Cash at Bank", platform: "all" },
  { keyword: "service fee", debitAccountCode: "6100", debitAccountName: "Bank Charges", creditAccountCode: "BANK_GL", creditAccountName: "Cash at Bank", platform: "all" },
  { keyword: "monthly fee", debitAccountCode: "6100", debitAccountName: "Bank Charges", creditAccountCode: "BANK_GL", creditAccountName: "Cash at Bank", platform: "all" },
  { keyword: "account fee", debitAccountCode: "6100", debitAccountName: "Bank Charges", creditAccountCode: "BANK_GL", creditAccountName: "Cash at Bank", platform: "all" },
  { keyword: "mthly fee", debitAccountCode: "6100", debitAccountName: "Bank Charges", creditAccountCode: "BANK_GL", creditAccountName: "Cash at Bank", platform: "all" },
  { keyword: "serv chg", debitAccountCode: "6100", debitAccountName: "Bank Charges", creditAccountCode: "BANK_GL", creditAccountName: "Cash at Bank", platform: "all" },
  { keyword: "bank charge", debitAccountCode: "6100", debitAccountName: "Bank Charges", creditAccountCode: "BANK_GL", creditAccountName: "Cash at Bank", platform: "all" },
  { keyword: "commission", debitAccountCode: "6100", debitAccountName: "Bank Charges", creditAccountCode: "BANK_GL", creditAccountName: "Cash at Bank", platform: "all" },

  // Interest income (debit cash, credit revenue)
  { keyword: "interest credit", debitAccountCode: "BANK_GL", debitAccountName: "Cash at Bank", creditAccountCode: "4200", creditAccountName: "Interest Income", platform: "all" },
  { keyword: "interest earned", debitAccountCode: "BANK_GL", debitAccountName: "Cash at Bank", creditAccountCode: "4200", creditAccountName: "Interest Income", platform: "all" },
  { keyword: "interest income", debitAccountCode: "BANK_GL", debitAccountName: "Cash at Bank", creditAccountCode: "4200", creditAccountName: "Interest Income", platform: "all" },
];

export interface ClassifiedBankTransaction {
  debitAccountCode: string;
  debitAccountName: string;
  creditAccountCode: string;
  creditAccountName: string;
  confidence: number;
  tier: number;
  reasoning: string;
}

export function classifyBankTransactionWithRules(
  description: string,
  direction: string,
  rules: Array<{ keyword: string; debitAccountCode: string; debitAccountName: string; creditAccountCode: string; creditAccountName: string; platform: string; priority?: number }>,
  bankName: string
): ClassifiedBankTransaction | null {
  const descLower = description.toLowerCase().trim();

  const applicableRules = rules.filter(
    (r) => r.platform === "all" || r.platform === bankName.toLowerCase()
  );

  let bestMatch: typeof applicableRules[0] | null = null;
  let bestMatchLength = 0;
  let isExactMatch = false;

  for (const rule of applicableRules) {
    const keywordLower = rule.keyword.toLowerCase();

    if (descLower === keywordLower) {
      if (!isExactMatch || keywordLower.length > bestMatchLength) {
        bestMatch = rule;
        bestMatchLength = keywordLower.length;
        isExactMatch = true;
      }
    } else if (!isExactMatch && descLower.includes(keywordLower)) {
      if (keywordLower.length > bestMatchLength) {
        bestMatch = rule;
        bestMatchLength = keywordLower.length;
      }
    }
  }

  if (bestMatch) {
    return {
      debitAccountCode: bestMatch.debitAccountCode,
      debitAccountName: bestMatch.debitAccountName,
      creditAccountCode: bestMatch.creditAccountCode,
      creditAccountName: bestMatch.creditAccountName,
      confidence: isExactMatch ? 0.98 : 0.92,
      tier: 1,
      reasoning: `Tier 1 rule match: "${bestMatch.keyword}" found in description`,
    };
  }

  return null;
}

export async function loadBankReconRules(
  ctx: QueryCtx,
  businessId: Id<"businesses">
): Promise<Array<{ keyword: string; debitAccountCode: string; debitAccountName: string; creditAccountCode: string; creditAccountName: string; platform: string; priority?: number }>> {
  const dbRules = await ctx.db
    .query("bank_recon_classification_rules")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .collect();

  const activeRules = dbRules.filter((r) => r.isActive && !r.deletedAt);

  if (activeRules.length > 0) {
    // Need to resolve account IDs to codes
    const rules = [];
    for (const r of activeRules) {
      const debitAccount = await ctx.db.get(r.debitAccountId);
      const creditAccount = await ctx.db.get(r.creditAccountId);
      if (debitAccount && creditAccount) {
        rules.push({
          keyword: r.keyword,
          debitAccountCode: debitAccount.accountCode,
          debitAccountName: debitAccount.accountName,
          creditAccountCode: creditAccount.accountCode,
          creditAccountName: creditAccount.accountName,
          platform: r.platform,
          priority: r.priority ?? r.keyword.length,
        });
      }
    }
    return rules;
  }

  return DEFAULT_BANK_RECON_RULES.map((r) => ({
    ...r,
    priority: r.keyword.length,
  }));
}
