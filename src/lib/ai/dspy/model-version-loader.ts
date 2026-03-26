/**
 * DSPy Model Version Loader
 *
 * Loads active DSPy-optimized prompts from Convex + S3 for agent initialization.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { ModelVersion, OptimizedPromptArtifact } from "./types";

/**
 * S3 client for fetching optimized prompt artifacts
 */
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

/**
 * Convex client for querying model versions
 */
const convexClient = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL || ""
);

/**
 * Get the active (promoted) model version for a given DSPy module
 *
 * @param module - DSPy module name (e.g., "chat-agent-intent")
 * @returns Active ModelVersion or null if no promoted version exists
 */
export async function getActiveVersion(
  module: string
): Promise<ModelVersion | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const version = await convexClient.query(
      (api as any).functions.chatOptimizationNew.getActiveVersion,
      { module }
    );
    return version as ModelVersion | null;
  } catch (error) {
    console.error(`[model-version-loader] Failed to get active version for ${module}:`, error);
    return null;
  }
}

/**
 * Load optimized prompt artifact from S3
 *
 * @param s3Key - S3 key path (e.g., "dspy/chat-agent/chat-agent-intent/v20260320-001.json")
 * @returns Optimized prompt artifact
 */
export async function loadPromptFromS3(
  s3Key: string
): Promise<OptimizedPromptArtifact | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || "finanseal-bucket",
      Key: s3Key,
    });

    const response = await s3Client.send(command);
    const bodyString = await response.Body?.transformToString();

    if (!bodyString) {
      console.error(`[model-version-loader] Empty response body for ${s3Key}`);
      return null;
    }

    const artifact = JSON.parse(bodyString) as OptimizedPromptArtifact;
    return artifact;
  } catch (error) {
    console.error(`[model-version-loader] Failed to load prompt from S3 (${s3Key}):`, error);
    return null;
  }
}

/**
 * Load active optimized prompt for a DSPy module
 *
 * Combines getActiveVersion + loadPromptFromS3 for convenience.
 *
 * @param module - DSPy module name
 * @returns Optimized prompt artifact or null
 */
export async function loadActivePrompt(
  module: string
): Promise<OptimizedPromptArtifact | null> {
  const version = await getActiveVersion(module);
  if (!version) {
    console.warn(`[model-version-loader] No active version for module ${module}`);
    return null;
  }

  return loadPromptFromS3(version.s3Key);
}

/**
 * Performance metrics for model version loading
 */
export interface LoadingMetrics {
  durationMs: number;
  source: "convex" | "s3" | "both";
  cached: boolean;
}

/**
 * Cache for loaded prompts (in-memory, per-process)
 */
const promptCache = new Map<string, {
  artifact: OptimizedPromptArtifact;
  loadedAt: number;
}>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load active prompt with caching
 *
 * @param module - DSPy module name
 * @returns Optimized prompt artifact with loading metrics
 */
export async function loadActivePromptCached(
  module: string
): Promise<{ artifact: OptimizedPromptArtifact | null; metrics: LoadingMetrics }> {
  const startTime = Date.now();

  // Check cache
  const cached = promptCache.get(module);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return {
      artifact: cached.artifact,
      metrics: {
        durationMs: Date.now() - startTime,
        source: "convex",
        cached: true,
      },
    };
  }

  // Load fresh
  const artifact = await loadActivePrompt(module);
  if (artifact) {
    promptCache.set(module, { artifact, loadedAt: Date.now() });
  }

  return {
    artifact,
    metrics: {
      durationMs: Date.now() - startTime,
      source: "both",
      cached: false,
    },
  };
}

/**
 * Clear prompt cache (useful for testing or after manual promotion)
 */
export function clearPromptCache(): void {
  promptCache.clear();
}

/**
 * Load active model for a specific business (033-ai-action-center-dspy)
 *
 * Business-scoped lookup via actionCenterOptimization.getActiveModel.
 * Returns the optimized prompt string (JSON) or null if no model exists.
 *
 * @param module - DSPy module name (e.g., "action-center-relevance")
 * @param businessId - Business ID for per-business model isolation
 * @returns Optimized prompt string or null
 */
export async function loadActiveModelForBusiness(
  module: string,
  businessId: string
): Promise<{ optimizedPrompt: string | null; metrics: LoadingMetrics }> {
  const startTime = Date.now();
  const cacheKey = `${module}:${businessId}`;

  // Check cache
  const cached = promptCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return {
      optimizedPrompt: JSON.stringify(cached.artifact),
      metrics: { durationMs: Date.now() - startTime, source: "convex", cached: true },
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await convexClient.query(
      (api as any).functions.actionCenterOptimization.getActiveModel,
      { businessId, module }
    );

    if (!result?.hasModel) {
      return {
        optimizedPrompt: null,
        metrics: { durationMs: Date.now() - startTime, source: "convex", cached: false },
      };
    }

    // If optimizedPrompt is stored inline in Convex (avoids S3 round-trip)
    if (result.version?.optimizedPrompt) {
      const artifact = JSON.parse(result.version.optimizedPrompt) as OptimizedPromptArtifact;
      promptCache.set(cacheKey, { artifact, loadedAt: Date.now() });
      return {
        optimizedPrompt: result.version.optimizedPrompt,
        metrics: { durationMs: Date.now() - startTime, source: "convex", cached: false },
      };
    }

    // Otherwise load from S3
    if (result.version?.s3Key) {
      const artifact = await loadPromptFromS3(result.version.s3Key);
      if (artifact) {
        promptCache.set(cacheKey, { artifact, loadedAt: Date.now() });
      }
      return {
        optimizedPrompt: artifact ? JSON.stringify(artifact) : null,
        metrics: { durationMs: Date.now() - startTime, source: "both", cached: false },
      };
    }

    return {
      optimizedPrompt: null,
      metrics: { durationMs: Date.now() - startTime, source: "convex", cached: false },
    };
  } catch (error) {
    console.error(`[model-version-loader] Failed to load model for ${module}:${businessId}:`, error);
    return {
      optimizedPrompt: null,
      metrics: { durationMs: Date.now() - startTime, source: "convex", cached: false },
    };
  }
}
