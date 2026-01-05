/**
 * Workflow Convex Functions
 *
 * Queries and mutations for workflow execution tracking.
 * Used by Lambda Durable Functions for state persistence and idempotency.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { workflowTypeValidator, workflowStatusValidator } from "../lib/validators";

// ============================================
// QUERIES
// ============================================

/**
 * Get workflow execution by execution ID (Svix webhook ID)
 *
 * Used for idempotency check - if this returns a result,
 * the webhook has already been processed.
 */
export const getByExecutionId = query({
  args: { executionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflow_executions")
      .withIndex("by_executionId", (q) => q.eq("executionId", args.executionId))
      .first();
  },
});

/**
 * Get workflow execution by ID
 */
export const getById = query({
  args: { id: v.id("workflow_executions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get workflow executions for a user
 */
export const getWorkflowsForUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("workflow_executions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get running workflows (for monitoring)
 */
export const getRunningWorkflows = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("workflow_executions")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(limit);
  },
});

/**
 * Get failed workflows (for debugging)
 */
export const getFailedWorkflows = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("workflow_executions")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(limit);
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new workflow execution
 *
 * Called when a webhook triggers a new workflow.
 * The executionId (Svix webhook ID) ensures idempotency.
 */
export const createWorkflowExecution = mutation({
  args: {
    userId: v.id("users"),
    businessId: v.optional(v.id("businesses")),
    workflowType: workflowTypeValidator,
    executionId: v.string(), // Svix webhook ID
    workflowArn: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Idempotency check - return existing if already created
    const existing = await ctx.db
      .query("workflow_executions")
      .withIndex("by_executionId", (q) => q.eq("executionId", args.executionId))
      .first();

    if (existing) {
      console.log(`Workflow already exists for executionId: ${args.executionId}`);
      return existing._id;
    }

    return await ctx.db.insert("workflow_executions", {
      userId: args.userId,
      businessId: args.businessId,
      workflowType: args.workflowType,
      executionId: args.executionId,
      workflowArn: args.workflowArn,
      status: "running",
      currentStage: "started",
      completedStages: ["started"],
      startedAt: Date.now(),
      metadata: args.metadata,
    });
  },
});

/**
 * Update workflow execution status
 *
 * Called by Lambda Durable Function checkpoints to update progress.
 */
export const updateWorkflowStatus = mutation({
  args: {
    executionId: v.string(),
    status: v.optional(workflowStatusValidator),
    currentStage: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { executionId, status, currentStage, errorMessage, metadata } = args;

    // Find workflow by execution ID
    const workflow = await ctx.db
      .query("workflow_executions")
      .withIndex("by_executionId", (q) => q.eq("executionId", executionId))
      .first();

    if (!workflow) {
      console.error(`Workflow not found for executionId: ${executionId}`);
      return null;
    }

    const updates: Record<string, unknown> = {};

    if (status) {
      updates.status = status;

      if (status === "completed") {
        updates.completedAt = Date.now();
      } else if (status === "failed") {
        updates.failedAt = Date.now();
        if (errorMessage) {
          updates.errorMessage = errorMessage;
        }
      }
    }

    if (currentStage) {
      updates.currentStage = currentStage;

      // Add to completed stages if not already there
      if (!workflow.completedStages.includes(currentStage)) {
        updates.completedStages = [...workflow.completedStages, currentStage];
      }
    }

    if (metadata) {
      updates.metadata = {
        ...workflow.metadata,
        ...metadata,
      };
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(workflow._id, updates);
    }

    return workflow._id;
  },
});

/**
 * Mark workflow as completed
 */
export const completeWorkflow = mutation({
  args: {
    executionId: v.string(),
    finalStage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db
      .query("workflow_executions")
      .withIndex("by_executionId", (q) => q.eq("executionId", args.executionId))
      .first();

    if (!workflow) {
      console.error(`Workflow not found for executionId: ${args.executionId}`);
      return null;
    }

    const completedStages = args.finalStage
      ? [...workflow.completedStages, args.finalStage]
      : workflow.completedStages;

    await ctx.db.patch(workflow._id, {
      status: "completed",
      currentStage: args.finalStage ?? workflow.currentStage,
      completedStages,
      completedAt: Date.now(),
    });

    return workflow._id;
  },
});

/**
 * Mark workflow as failed
 */
export const failWorkflow = mutation({
  args: {
    executionId: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db
      .query("workflow_executions")
      .withIndex("by_executionId", (q) => q.eq("executionId", args.executionId))
      .first();

    if (!workflow) {
      console.error(`Workflow not found for executionId: ${args.executionId}`);
      return null;
    }

    await ctx.db.patch(workflow._id, {
      status: "failed",
      errorMessage: args.errorMessage,
      failedAt: Date.now(),
    });

    return workflow._id;
  },
});
