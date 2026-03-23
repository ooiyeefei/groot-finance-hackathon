/**
 * Monthly Aging Reports Module
 *
 * Triggered on the 1st of each month by EventBridge.
 * For each eligible business:
 * 1. Creates Action Center notification for owner to generate/review reports
 * 2. Gets the business owner's userId for the notification
 *
 * The actual PDF generation happens via Next.js API routes when the owner
 * clicks "Generate" (since @react-pdf/renderer needs Node.js runtime).
 *
 * Part of 035-aging-payable-receivable-report feature.
 */

import { convexQuery, convexMutation } from '../lib/convex-client';
import { JobResult } from '../lib/types';

interface Business {
  _id: string;
  name: string;
  reportSettings?: {
    autoGenerateMonthly?: boolean;
    notifyEmail?: boolean;
  };
}

interface BusinessMembership {
  userId: string;
  role: string;
}

export async function runMonthlyAgingReports(): Promise<Omit<JobResult, 'durationMs'>> {
  console.log('[MonthlyAgingReports] Starting monthly aging report generation...');

  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

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

    let notified = 0;
    let errors = 0;

    for (const business of eligibleBusinesses) {
      try {
        console.log(`[MonthlyAgingReports] Processing business: ${business.name} (${business._id})`);

        // Find the business owner (finance_admin or owner role)
        const memberships = await convexQuery<BusinessMembership[]>(
          'functions/businessMemberships:listByBusiness',
          { businessId: business._id }
        );

        const ownerMembership = memberships?.find(
          (m) => m.role === 'owner' || m.role === 'finance_admin'
        );

        if (!ownerMembership) {
          console.warn(`[MonthlyAgingReports] No owner found for business ${business._id}, skipping`);
          continue;
        }

        // FR-015: Pre-generation reconciliation check
        const reconResult = await convexQuery<{
          matches: Array<{ bankDescription: string; matchedCustomerName: string; bankAmount: number }>;
          matchCount: number;
        }>('functions/reports:checkUnreconciledMatches', {
          businessId: business._id,
        });

        const hasReconWarnings = (reconResult?.matchCount ?? 0) > 0;
        const reconWarningText = hasReconWarnings
          ? ` ⚠ ${reconResult!.matchCount} bank transaction(s) may match outstanding invoices — review before sending statements.`
          : '';

        // Create Action Center notification
        await convexMutation('functions/actionCenterInsights:internalCreate', {
          userId: ownerMembership.userId,
          businessId: business._id,
          category: hasReconWarnings ? 'cashflow' : 'deadline',
          priority: hasReconWarnings ? 'high' : 'medium',
          title: `${periodMonth} Aging Reports Ready${hasReconWarnings ? ' (Review Needed)' : ''}`,
          description: `Your monthly AP and AR aging reports for ${periodMonth} are ready to generate.${reconWarningText} Visit the Reports page to generate consolidated reports and debtor statements.`,
          affectedEntities: ['reports', 'aging', ...(hasReconWarnings ? ['reconciliation'] : [])],
          recommendedAction: hasReconWarnings
            ? `Review ${reconResult!.matchCount} potential bank matches before generating statements to ensure accuracy.`
            : `Generate your ${periodMonth} aging reports and review debtor statements before sending.`,
          metadata: {
            type: 'monthly_aging_report',
            periodMonth,
            link: '/reports',
            hasReconWarnings,
            reconMatchCount: reconResult?.matchCount ?? 0,
          },
        });

        console.log(`[MonthlyAgingReports] Notification created for ${business.name}`);
        notified++;
      } catch (error) {
        console.error(
          `[MonthlyAgingReports] Error processing business ${business._id}:`,
          error
        );
        errors++;
      }
    }

    console.log(
      `[MonthlyAgingReports] Complete: ${notified} notified, ${errors} errors`
    );

    return {
      module: 'monthly-aging-reports',
      status: errors > 0 ? 'partial' : 'success',
      documentsRead: businesses.length,
      documentsWritten: notified,
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
