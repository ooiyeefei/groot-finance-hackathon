/**
 * DSPy Model Version Loader
 *
 * Loads optimized prompts and few-shot examples from Convex dspy_model_versions
 * for use in TypeScript LangGraph nodes at inference time.
 *
 * Caches loaded configs for 5 minutes to avoid repeated DB queries.
 */

export interface OptimizedModuleConfig {
  domain: string;
  version: number;
  systemPrompt: string;
  fewShotExamples: Array<{
    query: string;
    expectedOutput: Record<string, unknown>;
  }>;
  trainedAt: number;
}

// In-memory cache with TTL
const cache = new Map<string, { config: OptimizedModuleConfig | null; loadedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load optimized DSPy config for a given domain.
 *
 * This is a lightweight loader that parses the optimizedPrompt JSON field
 * from dspy_model_versions. The actual Convex query is done via the
 * chat API route which has access to the Convex client.
 *
 * For now, returns null (no optimized config available) until the optimization
 * pipeline has run and produced at least one trained model version.
 * The intent-node and model-node will fall back to their default prompts.
 */
export async function loadOptimizedConfig(
  domain: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convexClient?: any
): Promise<OptimizedModuleConfig | null> {
  // Check cache
  const cached = cache.get(domain);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  // If no Convex client provided, can't load — return null (use default prompts)
  if (!convexClient) {
    cache.set(domain, { config: null, loadedAt: Date.now() });
    return null;
  }

  try {
    const result = await convexClient.query(
      'functions/chatCorrections:getActiveModelVersion',
      { domain }
    );

    if (!result || !result.optimizedPrompt) {
      cache.set(domain, { config: null, loadedAt: Date.now() });
      return null;
    }

    // Parse the optimized prompt JSON
    const parsed = JSON.parse(result.optimizedPrompt);

    const config: OptimizedModuleConfig = {
      domain,
      version: result.version,
      systemPrompt: parsed.systemPrompt || '',
      fewShotExamples: parsed.fewShotExamples || [],
      trainedAt: result.trainedAt,
    };

    cache.set(domain, { config, loadedAt: Date.now() });
    return config;
  } catch (error) {
    console.warn(`[ModelVersionLoader] Failed to load optimized config for ${domain}:`, error);
    cache.set(domain, { config: null, loadedAt: Date.now() });
    return null;
  }
}

/**
 * Clear the cache for a specific domain or all domains.
 */
export function clearModelVersionCache(domain?: string): void {
  if (domain) {
    cache.delete(domain);
  } else {
    cache.clear();
  }
}
