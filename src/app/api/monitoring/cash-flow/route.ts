import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runCashFlowMonitoring, DEFAULT_MONITORING_CONFIG } from '@/lib/monitoring/cash-flow-monitor';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse query parameters for optional configuration overrides
    const searchParams = request.nextUrl.searchParams;
    const config = {
      ...DEFAULT_MONITORING_CONFIG,
      // Allow configuration overrides via query params
      ...(searchParams.get('cash_reserve_threshold') && {
        cash_reserve_threshold: parseInt(searchParams.get('cash_reserve_threshold')!)
      }),
      ...(searchParams.get('receivables_aging_days') && {
        receivables_aging_days: parseInt(searchParams.get('receivables_aging_days')!)
      }),
      ...(searchParams.get('payables_aging_days') && {
        payables_aging_days: parseInt(searchParams.get('payables_aging_days')!)
      })
    };

    // Run cash flow monitoring
    const monitoringResult = await runCashFlowMonitoring(userId, config);

    return NextResponse.json(monitoringResult, { status: 200 });

  } catch (error) {
    console.error('Cash flow monitoring API error:', error);

    return NextResponse.json(
      {
        error: 'Failed to run cash flow monitoring',
        details: error instanceof Error ? error.message : 'Unknown error',
        alerts: [],
        projections: [],
        summary: {
          total_alerts: 0,
          critical_alerts: 0
        }
      },
      { status: 500 }
    );
  }
}