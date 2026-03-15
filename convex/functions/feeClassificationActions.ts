/**
 * Fee Classification Actions — Tier 2 DSPy classification + fee adjustments
 *
 * Tier 2: Uses DSPy Lambda (Gemini 3.1 Flash-Lite) to classify unknown fee names
 * that Tier 1 rules didn't match. Falls back to direct Gemini prompting if DSPy
 * is unavailable or corrections < 20.
 *
 * Also provides mutation for manual fee amount adjustments (to fix balance discrepancies).
 */

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { FEE_ACCOUNT_CODES, validateFeeBalance, getClassificationStatus } from "../lib/feeClassifier";
import { callMCPTool } from "../lib/mcpClient";
import type { ClassifiedFee } from "../lib/feeClassifier";

// ============================================
// TIER 2: DSPY / AI CLASSIFICATION
// ============================================

/**
 * Internal query: get unclassified fees for a batch of orders
 */
export const getUnclassifiedFees = internalQuery({
  args: {
    businessId: v.id("businesses"),
    importBatchId: v.string(),
  },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("sales_orders")
      .withIndex("by_businessId_importBatchId", (q) =>
        q.eq("businessId", args.businessId).eq("importBatchId", args.importBatchId)
      )
      .collect();

    const unclassifiedItems: Array<{
      orderId: string;
      feeIndex: number;
      feeName: string;
      amount: number;
      platform: string;
      grossAmount: number;
      netAmount: number | undefined;
    }> = [];

    for (const order of orders) {
      const classifiedFees = order.classifiedFees as ClassifiedFee[] | undefined;
      if (!classifiedFees) continue;

      classifiedFees.forEach((fee, idx) => {
        if (fee.tier === 0) {
          unclassifiedItems.push({
            orderId: order._id,
            feeIndex: idx,
            feeName: fee.feeName,
            amount: fee.amount,
            platform: order.sourcePlatform ?? "unknown",
            grossAmount: order.grossAmount,
            netAmount: order.netAmount,
          });
        }
      });
    }

    return unclassifiedItems;
  },
});

/**
 * Internal query: get corrections for a business, optionally filtered by platform
 */
export const getCorrections = internalQuery({
  args: {
    businessId: v.id("businesses"),
    platform: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let corrections;
    if (args.platform) {
      corrections = await ctx.db
        .query("fee_classification_corrections")
        .withIndex("by_businessId_platform", (q) =>
          q.eq("businessId", args.businessId).eq("platform", args.platform!)
        )
        .order("desc")
        .collect();
    } else {
      corrections = await ctx.db
        .query("fee_classification_corrections")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .order("desc")
        .collect();
    }

    if (args.limit) {
      corrections = corrections.slice(0, args.limit);
    }

    return corrections;
  },
});

/**
 * Internal query: count corrections per platform (for DSPy activation threshold)
 */
export const getCorrectionCount = internalQuery({
  args: {
    businessId: v.id("businesses"),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("fee_classification_corrections")
      .withIndex("by_businessId_platform", (q) =>
        q.eq("businessId", args.businessId).eq("platform", args.platform)
      )
      .collect();

    return corrections.length;
  },
});

/**
 * Internal mutation: update classified fees on orders after Tier 2 classification
 */
export const updateClassifiedFees = internalMutation({
  args: {
    updates: v.array(v.object({
      orderId: v.id("sales_orders"),
      feeIndex: v.number(),
      accountCode: v.string(),
      accountName: v.string(),
      confidence: v.number(),
      isNew: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    // Group updates by order
    const orderUpdates = new Map<string, Array<{
      feeIndex: number; accountCode: string; accountName: string;
      confidence: number; isNew: boolean;
    }>>();

    for (const update of args.updates) {
      const orderId = update.orderId;
      const existing = orderUpdates.get(orderId) ?? [];
      existing.push({
        feeIndex: update.feeIndex,
        accountCode: update.accountCode,
        accountName: update.accountName,
        confidence: update.confidence,
        isNew: update.isNew,
      });
      orderUpdates.set(orderId, existing);
    }

    const now = Date.now();
    for (const [orderIdStr, updates] of orderUpdates) {
      const orderId = orderIdStr as unknown as typeof args.updates[0]["orderId"];
      const order = await ctx.db.get(orderId);
      if (!order || !order.classifiedFees) continue;

      const fees = [...(order.classifiedFees as unknown as ClassifiedFee[])];
      for (const upd of updates) {
        if (upd.feeIndex >= 0 && upd.feeIndex < fees.length) {
          fees[upd.feeIndex] = {
            ...fees[upd.feeIndex],
            accountCode: upd.accountCode,
            accountName: upd.accountName,
            confidence: upd.confidence,
            tier: 2,
            isNew: upd.isNew,
          };
        }
      }

      await ctx.db.patch(orderId, {
        classifiedFees: fees,
        feeClassificationStatus: getClassificationStatus(fees),
        updatedAt: now,
      });
    }
  },
});

/**
 * Tier 2 Classification — calls DSPy Lambda via MCP for unknown fees.
 * Falls back to direct Gemini prompting if DSPy unavailable or insufficient corrections.
 */
export const classifyUnknownFees = internalAction({
  args: {
    businessId: v.id("businesses"),
    importBatchId: v.string(),
  },
  handler: async (ctx, args): Promise<{ classified: number; skipped: number }> => {
    // 1. Get unclassified fees
    const unclassified = await ctx.runQuery(internal.functions.feeClassificationActions.getUnclassifiedFees as any, { businessId: args.businessId, importBatchId: args.importBatchId });

    if (unclassified.length === 0) {
      return { classified: 0, skipped: 0 };
    }

    // 2. Determine platform (use most common platform in batch)
    const platformCounts = new Map<string, number>();
    for (const item of unclassified) {
      platformCounts.set(item.platform, (platformCounts.get(item.platform) ?? 0) + 1);
    }
    const platform = [...platformCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // 3. Get corrections for this business
    const corrections = await ctx.runQuery(
      internal.functions.feeClassificationActions.getCorrections,
      { businessId: args.businessId, platform, limit: 50 }
    );

    // 4. Get active DSPy model for this platform
    const activeModel = await ctx.runQuery(
      internal.functions.dspyModelVersions.getActiveModel,
      { platform }
    );

    // 5. Deduplicate fee names
    const uniqueFeeNames = [...new Set(unclassified.map((f: { feeName: string }) => f.feeName))] as string[];
    const uniqueFees = uniqueFeeNames.map((name) => {
      const item = unclassified.find((f: { feeName: string; amount: number }) => f.feeName === name)!;
      return { feeName: name, amount: item.amount };
    });

    // 6. Call DSPy Lambda via MCP
    const businessCorrections = corrections.map((c: any) => ({
      feeName: c.originalFeeName,
      originalAccountCode: c.originalAccountCode,
      correctedAccountCode: c.correctedAccountCode,
      platform: c.platform,
    }));

    // Use first order's gross/net for balance check context
    const sampleOrder = unclassified[0];

    interface ClassifyFeesResult {
      classifications: Array<{
        feeName: string;
        accountCode: string;
        accountName: string;
        confidence: number;
        isNew: boolean;
        reasoning: string;
      }>;
      balanceCheck: {
        balanced: boolean;
        totalFees: number;
        expectedFees: number;
        discrepancy: number;
      } | null;
      usedDspy: boolean;
      modelVersion: string;
    }

    let result: ClassifyFeesResult | null = null;

    try {
      result = await callMCPTool<ClassifyFeesResult>({
        toolName: "classify_fees",
        businessId: args.businessId as string,
        args: {
          platform,
          fees: uniqueFees,
          grossAmount: sampleOrder.grossAmount,
          netAmount: sampleOrder.netAmount,
          businessCorrections,
          modelS3Key: activeModel?.s3Key ?? null,
        },
      });
    } catch (error) {
      console.warn("[Tier2] DSPy Lambda call failed, attempting Gemini fallback:", error);
      // Fallback: direct Gemini 3.1 Flash-Lite call (non-DSPy)
      result = await _geminiDirectFallback(uniqueFees, platform, businessCorrections);
    }

    if (!result || !result.classifications) {
      console.warn("[Tier2] Both DSPy and Gemini fallback returned no results");
      return { classified: 0, skipped: unclassified.length };
    }

    // 7. Map results back to unclassified fees
    const classificationMap = new Map<string, ClassifyFeesResult["classifications"][0]>();
    for (const c of result.classifications) {
      classificationMap.set(c.feeName.toLowerCase(), c);
    }

    const updates: Array<{
      orderId: any;
      feeIndex: number;
      accountCode: string;
      accountName: string;
      confidence: number;
      isNew: boolean;
    }> = [];

    for (const item of unclassified) {
      const classification = classificationMap.get(item.feeName.toLowerCase());
      if (classification) {
        const validCode = classification.accountCode in FEE_ACCOUNT_CODES;
        updates.push({
          orderId: item.orderId,
          feeIndex: item.feeIndex,
          accountCode: validCode ? classification.accountCode : "5800",
          accountName: validCode ? classification.accountName : "Platform Fees (General)",
          confidence: classification.confidence,
          isNew: classification.isNew,
        });
      }
    }

    // 8. Persist updates
    if (updates.length > 0) {
      await ctx.runMutation(
        internal.functions.feeClassificationActions.updateClassifiedFees,
        { updates }
      );
    }

    console.log(`[Tier2] Classified ${updates.length}/${unclassified.length} fees (DSPy: ${result.usedDspy}, model: ${result.modelVersion})`);
    return { classified: updates.length, skipped: unclassified.length - updates.length };
  },
});

// ============================================
// FEE ADJUSTMENT (for fixing unbalanced orders)
// ============================================

/**
 * Adjust a fee amount on an order to fix balance discrepancies.
 * Only allowed on open (non-closed) periods.
 */
export const adjustFeeAmount = mutation({
  args: {
    orderId: v.id("sales_orders"),
    feeIndex: v.number(),
    newAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    if (order.periodStatus === "closed") {
      throw new Error("Cannot adjust fees on a closed period. Reopen the period first.");
    }

    const classifiedFees = [...(order.classifiedFees as unknown as ClassifiedFee[] ?? [])] as ClassifiedFee[];
    if (args.feeIndex < 0 || args.feeIndex >= classifiedFees.length) {
      throw new Error("Invalid fee index");
    }

    classifiedFees[args.feeIndex] = {
      ...classifiedFees[args.feeIndex],
      amount: args.newAmount,
    };

    // Revalidate balance
    const validation = validateFeeBalance(
      order.grossAmount,
      order.netAmount,
      classifiedFees
    );

    await ctx.db.patch(args.orderId, {
      classifiedFees,
      balanceValidationStatus: validation.isBalanced ? "balanced" : "unbalanced",
      balanceDiscrepancy: validation.isBalanced ? undefined : validation.discrepancy,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      isBalanced: validation.isBalanced,
      discrepancy: validation.discrepancy,
    };
  },
});

// ============================================
// GEMINI DIRECT FALLBACK (when DSPy Lambda unavailable)
// ============================================

const GEMINI_FALLBACK_CONFIDENCE_CAP = 0.80;

/**
 * Direct Gemini 3.1 Flash-Lite classification — no DSPy, no MCP.
 * Used when the DSPy Lambda is unavailable (timeout, error, cold start failure).
 * Confidence capped at 0.80 to signal reduced optimization.
 */
async function _geminiDirectFallback(
  fees: Array<{ feeName: string; amount: number }>,
  platform: string,
  corrections: Array<{ feeName: string; correctedAccountCode: string; platform: string }>
): Promise<{
  classifications: Array<{
    feeName: string; accountCode: string; accountName: string;
    confidence: number; isNew: boolean; reasoning: string;
  }>;
  balanceCheck: null;
  usedDspy: false;
  modelVersion: "fallback_gemini";
} | null> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("[Tier2-Fallback] No GEMINI_API_KEY env var");
    return null;
  }

  const accountCodeList = Object.entries(FEE_ACCOUNT_CODES)
    .map(([code, name]) => `${code}: ${name}`)
    .join("\n");

  const correctionExamples = corrections
    .slice(0, 20)
    .map((c) => `"${c.feeName}" → ${c.correctedAccountCode}`)
    .join("\n");

  const feeList = fees.map((f, i) => `${i + 1}. "${f.feeName}"`).join("\n");

  const prompt = `You are a financial fee classifier for ${platform} e-commerce settlements.

Available account codes:
${accountCodeList}

${correctionExamples ? `Previous corrections (learn from these):\n${correctionExamples}\n` : ""}

Classify these fees. Return ONLY valid JSON array:
${feeList}

Format: [{"feeName":"...","accountCode":"5801","accountName":"Commission Fees","confidence":0.75,"reasoning":"..."}]`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
        }),
      }
    );

    if (!response.ok) {
      console.error(`[Tier2-Fallback] Gemini API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[Tier2-Fallback] Could not extract JSON from Gemini response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      feeName: string; accountCode: string; accountName: string;
      confidence: number; reasoning?: string;
    }>;

    const knownFees = new Set(corrections.map((c) => c.feeName.toLowerCase()));

    const classifications = parsed.map((p) => ({
      feeName: p.feeName,
      accountCode: p.accountCode in FEE_ACCOUNT_CODES ? p.accountCode : "5800",
      accountName: p.accountCode in FEE_ACCOUNT_CODES
        ? (FEE_ACCOUNT_CODES as Record<string, string>)[p.accountCode]
        : "Platform Fees (General)",
      confidence: Math.min(p.confidence ?? 0.5, GEMINI_FALLBACK_CONFIDENCE_CAP),
      isNew: !knownFees.has(p.feeName.toLowerCase()),
      reasoning: p.reasoning ?? "Gemini direct classification (DSPy unavailable)",
    }));

    return {
      classifications,
      balanceCheck: null,
      usedDspy: false as const,
      modelVersion: "fallback_gemini" as const,
    };
  } catch (error) {
    console.error("[Tier2-Fallback] Gemini direct call failed:", error);
    return null;
  }
}
