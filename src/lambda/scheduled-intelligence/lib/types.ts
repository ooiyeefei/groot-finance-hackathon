/**
 * Type definitions for scheduled intelligence Lambda
 */

export interface EventBridgeEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: {
    module: JobModule;
  };
}

export type JobModule =
  | 'proactive-analysis'
  | 'ai-discovery'
  | 'notification-digest'
  | 'einvoice-monitoring'
  | 'ai-daily-digest'
  | 'einvoice-dspy-digest'
  | 'chat-agent-optimization'
  | 'weekly-email-digest'
  | 'scheduled-reports'
  | 'dspy-fee'
  | 'dspy-bank-recon'
  | 'dspy-po-match'
  | 'dspy-ar-match'
  | 'benchmarking-aggregation'
  | 'monthly-aging-reports';

export interface ConvexHttpQuery {
  path: string;
  args: Record<string, unknown>;
  format: 'json' | 'convex';
}

export interface ConvexHttpMutation {
  path: string;
  args: Record<string, unknown>;
  format: 'json' | 'convex';
}

export interface JobResult {
  module: JobModule;
  status: 'success' | 'error' | 'skipped' | 'partial';
  durationMs: number;
  documentsRead?: number;
  documentsWritten?: number;
  error?: string;
}
