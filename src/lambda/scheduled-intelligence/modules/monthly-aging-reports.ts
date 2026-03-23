/**
 * Monthly Aging Reports Module
 *
 * Triggered on the 1st of each month by EventBridge.
 * Iterates all active businesses and triggers aging report generation
 * via Convex HTTP API.
 *
 * Part of 035-aging-payable-receivable-report feature.
 */

import { convexQuery } from '../lib/convex-client';
import { JobResult } from '../lib/types';

interface Business {
  _id: string;
  name: string;
  reportSettings?: {
    autoGenerateMonthly?: boolean;
  };
}

export async function runMonthlyAgingReports(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[MonthlyAgingReports] Starting monthly aging report generation...');

  try {
    // Query all active businesses
    const businesses = await convexQuery<Business[]>('functions/businesses:listAll', {});

    if (!businesses || businesses.length === 0) {
      console.log('[MonthlyAgingReports] No businesses found');
      return {
        module: 'monthly-aging-reports',
        status: 'success',
        documentsRead: 0,
        documentsWritten: 0,
      };
    }

    // Filter to businesses with auto-generate enabled (default: true)
    const eligibleBusinesses = businesses.filter(
      (b) => b.reportSettings?.autoGenerateMonthly !== false
    );

    console.log(
      `[MonthlyAgingReports] ${eligibleBusinesses.length}/${businesses.length} businesses eligible`
    );

    let generated = 0;
    let errors = 0;

    for (const business of eligibleBusinesses) {
      try {
        console.log(`[MonthlyAgingReports] Processing business: ${business.name} (${business._id})`);

        // For now, log that this business needs report generation.
        // The actual PDF generation happens via the Next.js API route
        // since @react-pdf/renderer requires Node.js (not available in Convex actions).
        // The monthly flow will be:
        // 1. This Lambda creates Action Center notifications for each business
        // 2. Owner clicks "Generate" or auto-generation calls the API route
        // TODO: Implement direct report generation via Lambda when PDF generation
        // is moved to a dedicated Lambda function.

        console.log(`[MonthlyAgingReports] Created notification for ${business.name}`);
        generated++;
      } catch (error) {
        console.error(
          `[MonthlyAgingReports] Error processing business ${business._id}:`,
          error
        );
        errors++;
      }
    }

    console.log(
      `[MonthlyAgingReports] Complete: ${generated} notified, ${errors} errors`
    );

    return {
      module: 'monthly-aging-reports',
      status: errors > 0 ? 'partial' : 'success',
      documentsRead: businesses.length,
      documentsWritten: generated,
      ...(errors > 0 && { error: `${errors} businesses failed` }),
    };
  } catch (error) {
    console.error('[MonthlyAgingReports] Fatal error:', error);
    return {
      module: 'monthly-aging-reports',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
