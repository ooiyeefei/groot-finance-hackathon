/**
 * Convex HTTP Router (027-dspy-dash)
 *
 * Provides HTTP endpoints for external services (Lambda) to call Convex.
 * Uses X-Internal-Key auth (same pattern as MCP server).
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

/**
 * POST /ingest-dspy-metrics
 *
 * Lambda calls this after each DSPy classification to record metrics.
 * Auth: X-Internal-Key header validated against MCP_INTERNAL_SERVICE_KEY env var.
 */
http.route({
  path: "/ingest-dspy-metrics",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Validate internal service key
    const internalKey = request.headers.get("X-Internal-Key");
    const expectedKey = process.env.MCP_INTERNAL_SERVICE_KEY;

    if (!expectedKey || internalKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate required fields
    const { businessId, tool, usedDspy, confidence, refineRetries, latencyMs, inputTokens, outputTokens, success } = body;

    if (!businessId || !tool || typeof usedDspy !== "boolean" || typeof confidence !== "number") {
      return new Response(JSON.stringify({ error: "Missing required fields: businessId, tool, usedDspy, confidence" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ctx.runMutation(internal.functions.dspyMetrics.upsertMetric, {
      businessId: businessId as Id<"businesses">,
      tool: tool as string,
      usedDspy: usedDspy as boolean,
      confidence: (confidence as number) || 0,
      refineRetries: (refineRetries as number) || 0,
      latencyMs: (latencyMs as number) || 0,
      inputTokens: (inputTokens as number) || 0,
      outputTokens: (outputTokens as number) || 0,
      success: success !== false,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
