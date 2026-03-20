/**
 * Scheduled Intelligence Lambda Handler
 *
 * EventBridge → Lambda → Convex HTTP API
 *
 * Handles all migrated cron jobs from Convex:
 * - Daily: proactive-analysis, ai-discovery, notification-digest, einvoice-monitoring
 * - Weekly: dspy-fee, dspy-bank-recon, dspy-po-match, dspy-ar-match, chat-agent-optimization
 * - Re-enabled: ai-daily-digest, einvoice-dspy-digest
 * - New: weekly-email-digest, scheduled-reports
 */

import { EventBridgeEvent, JobModule, JobResult } from './lib/types';

// Import job modules
import { runProactiveAnalysis } from './modules/proactive-analysis';
import { runAiDiscovery } from './modules/ai-discovery';
import { runNotificationDigest } from './modules/notification-digest';
import { runEinvoiceMonitoring } from './modules/einvoice-monitoring';
import { runAiDailyDigest } from './modules/ai-daily-digest';
import { runEinvoiceDspyDigest } from './modules/einvoice-dspy-digest';
import { runChatAgentOptimization } from './modules/chat-agent-optimization';
import { runWeeklyEmailDigest } from './modules/weekly-email-digest';
import { runScheduledReports } from './modules/scheduled-reports';
import { runDspyOptimization } from './modules/dspy-optimization';

export async function handler(event: EventBridgeEvent): Promise<JobResult> {
  const startTime = Date.now();
  const module = event.detail?.module;

  console.log(`[Handler] Starting job: ${module}`);

  if (!module) {
    throw new Error('Missing module parameter in event detail');
  }

  try {
    let result: Omit<JobResult, 'durationMs'>;

    // Dispatch to appropriate module
    switch (module) {
      case 'proactive-analysis':
        result = await runProactiveAnalysis();
        break;
      case 'ai-discovery':
        result = await runAiDiscovery();
        break;
      case 'notification-digest':
        result = await runNotificationDigest();
        break;
      case 'einvoice-monitoring':
        result = await runEinvoiceMonitoring();
        break;
      case 'ai-daily-digest':
        result = await runAiDailyDigest();
        break;
      case 'einvoice-dspy-digest':
        result = await runEinvoiceDspyDigest();
        break;
      case 'chat-agent-optimization':
        result = await runChatAgentOptimization();
        break;

      case 'weekly-email-digest':
        result = await runWeeklyEmailDigest();
        break;
      case 'scheduled-reports':
        result = await runScheduledReports();
        break;

      // DSPy optimization modules (all use same handler)
      case 'dspy-fee':
      case 'dspy-bank-recon':
      case 'dspy-po-match':
      case 'dspy-ar-match':
        result = await runDspyOptimization(module);
        break;

      default:
        throw new Error(`Unknown module: ${module}`);
    }

    const durationMs = Date.now() - startTime;
    const finalResult: JobResult = {
      ...result,
      durationMs,
    };

    console.log(
      `[Handler] Job complete: ${module} (${finalResult.status}) in ${durationMs}ms`,
      `Read: ${finalResult.documentsRead || 0}, Wrote: ${finalResult.documentsWritten || 0}`
    );

    return finalResult;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(`[Handler] Job failed: ${module}`, error);

    return {
      module,
      status: 'error',
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
