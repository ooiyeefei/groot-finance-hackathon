/**
 * DSPy Model Version Types
 *
 * Types for DSPy self-improvement pipeline: model versions, quality gates, optimization runs.
 */

/**
 * DSPy model version stored in Convex and S3
 */
export interface ModelVersion {
  /** Convex document ID */
  _id: string;
  /** Creation timestamp */
  _creationTime: number;

  /** Unique version identifier (e.g., "v20260320-001") */
  versionId: string;
  /** Which DSPy module (chat-agent-intent, chat-agent-response) */
  module: string;

  /** S3 path to optimized prompt JSON */
  s3Key: string;
  /** SHA-256 hash of prompt content */
  promptHash: string;

  /** Training metadata */
  correctionsConsumed: number;
  trainingExamples: number;
  validationExamples: number;
  optimizerType: "bootstrapfewshot" | "miprov2";
  optimizerConfig: {
    max_bootstrapped_demos: number;
    max_labeled_demos: number;
    max_rounds: number;
  };

  /** Evaluation metrics */
  evalMetrics: {
    validationAccuracy: number;
    perCategoryMetrics: {
      [intentCategory: string]: {
        precision: number;
        recall: number;
        f1: number;
        support: number;
      };
    };
    confusionMatrix: number[][];
  };

  /** Comparison to previous active version */
  comparisonVsPrevious?: {
    previousVersionId: string;
    accuracyDelta: number;
    passed: boolean;
  };

  /** Promotion status */
  status: "candidate" | "promoted" | "rejected" | "superseded";
  rejectionReason?: string;
  promotedAt?: number;
  supersededBy?: string;

  /** Traceability */
  triggerType: "manual" | "scheduled";
  triggeredBy?: string;
  durationMs: number;
}

/**
 * Quality gate evaluation result
 */
export interface QualityGateResult {
  /** Did candidate pass the quality gate? */
  passed: boolean;
  /** Candidate's validation accuracy */
  candidateAccuracy: number;
  /** Previous active version's accuracy (if exists) */
  previousAccuracy?: number;
  /** candidateAccuracy - previousAccuracy */
  accuracyDelta?: number;
  /** Why rejected (if passed=false) */
  rejectionReason?: string;
  /** Number of eval examples used */
  evalSetSize: number;
  /** Intent-level metrics breakdown */
  perCategoryBreakdown: {
    [intent: string]: {
      precision: number;
      recall: number;
      f1: number;
      support: number;
    };
  };
}

/**
 * Optimized prompt artifact structure (stored in S3)
 */
export interface OptimizedPromptArtifact {
  versionId: string;
  module: string;
  createdAt: string;
  systemInstructions: string;
  fewShotExamples: Array<{
    query: string;
    intent: string;
    rationale: string;
  }>;
  metadata: {
    correctionsUsed: number;
    validationAccuracy: number;
    trainingDurationMs: number;
  };
}

/**
 * Optimization run audit record
 */
export interface OptimizationRun {
  _id: string;
  _creationTime: number;

  runId: string;
  module: string;

  triggerType: "manual" | "scheduled";
  triggeredBy?: string;
  scheduleName?: string;

  correctionsProcessed: number;
  correctionsConsumed: string[];
  trainValidationSplit: {
    train: number;
    validation: number;
  };

  status: "success" | "skipped" | "failed" | "quality_gate_rejected";
  resultingVersionId?: string;

  qualityGateResult?: QualityGateResult;

  startTime: number;
  endTime?: number;
  durationMs?: number;

  errorMessage?: string;
  errorStack?: string;

  apiCost?: {
    geminiTokens: number;
    estimatedCostUSD: number;
  };
}
