/**
 * Model Version Loader for Chat Agent (T020)
 *
 * Loads DSPy-optimized prompts at agent initialization.
 * Falls back to hardcoded defaults if no optimized version exists.
 */

import { loadActivePromptCached } from '../dspy/model-version-loader';
import type { OptimizedPromptArtifact } from '../dspy/types';

/**
 * Cached active prompts per module
 */
const activePrompts: Map<string, OptimizedPromptArtifact | null> = new Map();

/**
 * Load active DSPy-optimized prompt for chat agent intent module
 *
 * @returns Optimized prompt artifact or null (uses fallback)
 */
export async function loadChatAgentIntentPrompt(): Promise<OptimizedPromptArtifact | null> {
  // Check cache first
  if (activePrompts.has('chat-agent-intent')) {
    return activePrompts.get('chat-agent-intent') || null;
  }

  try {
    console.log('[ModelLoader] Loading optimized prompt for chat-agent-intent...');

    const { artifact, metrics } = await loadActivePromptCached('chat-agent-intent');

    if (artifact) {
      console.log(
        `[ModelLoader] Loaded prompt ${artifact.versionId} (cached: ${metrics.cached}, ${metrics.durationMs}ms)`
      );
      activePrompts.set('chat-agent-intent', artifact);
      return artifact;
    } else {
      console.log('[ModelLoader] No active prompt found - using hardcoded defaults');
      activePrompts.set('chat-agent-intent', null);
      return null;
    }
  } catch (error) {
    console.error('[ModelLoader] Failed to load optimized prompt:', error);
    activePrompts.set('chat-agent-intent', null);
    return null;
  }
}

/**
 * Get system instructions from optimized prompt or fallback
 *
 * @param promptArtifact - Optimized prompt artifact (can be null)
 * @returns System instructions string
 */
export function getSystemInstructions(promptArtifact: OptimizedPromptArtifact | null): string {
  if (promptArtifact?.systemInstructions) {
    return promptArtifact.systemInstructions;
  }

  // Fallback: hardcoded system instructions
  return `You are Groot Finance's AI assistant. You help users with:
- Expense claims and reimbursements
- Sales invoices and AR management
- Financial analytics and reports
- Bank reconciliation
- Document processing (OCR, e-invoicing)
- General financial queries

Classify user intent into one of these categories:
- expense_claim
- sales_invoice
- analytics
- bank_reconciliation
- document_processing
- general_query

Be helpful, concise, and accurate. Ask clarifying questions when needed.`;
}

/**
 * Get few-shot examples from optimized prompt or fallback
 *
 * @param promptArtifact - Optimized prompt artifact (can be null)
 * @returns Array of few-shot examples
 */
export function getFewShotExamples(
  promptArtifact: OptimizedPromptArtifact | null
): Array<{ query: string; intent: string; rationale: string }> {
  if (promptArtifact?.fewShotExamples) {
    return promptArtifact.fewShotExamples;
  }

  // Fallback: hardcoded few-shot examples
  return [
    {
      query: "I need to submit my lunch receipt",
      intent: "expense_claim",
      rationale: "User wants to create an expense claim for reimbursement"
    },
    {
      query: "Show me this month's revenue",
      intent: "analytics",
      rationale: "User wants to view financial analytics/reports"
    },
    {
      query: "How do I reconcile my bank statement?",
      intent: "bank_reconciliation",
      rationale: "User needs help with bank reconciliation process"
    },
    {
      query: "Can you extract data from this invoice PDF?",
      intent: "document_processing",
      rationale: "User wants OCR/document extraction"
    }
  ];
}

/**
 * Clear model loader cache (for testing or manual refresh)
 */
export function clearModelCache(): void {
  activePrompts.clear();
  console.log('[ModelLoader] Model cache cleared');
}

/**
 * Preload model on agent startup
 * Call this once at app initialization (not per-request)
 */
export async function preloadModels(): Promise<void> {
  console.log('[ModelLoader] Preloading chat agent models...');
  await loadChatAgentIntentPrompt();
  console.log('[ModelLoader] Model preload complete');
}
