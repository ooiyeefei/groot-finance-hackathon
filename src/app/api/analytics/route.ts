import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { calculateFinancialAnalytics, calculateAnalyticsTrends, getAnalyticsPeriod } from '@/lib/analytics/engine';
import { SupportedCurrency } from '@/types/transaction';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') as 'month' | 'quarter' | 'year' || 'month';
    const periodStart = searchParams.get('periodStart');
    const periodEnd = searchParams.get('periodEnd');
    const homeCurrency = searchParams.get('homeCurrency') as SupportedCurrency || 'SGD';
    const forceRefresh = searchParams.get('forceRefresh') === 'true';
    const includeTrends = searchParams.get('includeTrends') === 'true';

    let startDate: Date;
    let endDate: Date;

    // Use custom date range if provided, otherwise use standard period
    if (periodStart && periodEnd) {
      startDate = new Date(periodStart);
      endDate = new Date(periodEnd);
      
      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD format.' },
          { status: 400 }
        );
      }
      
      if (startDate >= endDate) {
        return NextResponse.json(
          { error: 'Period start date must be before end date.' },
          { status: 400 }
        );
      }
    } else {
      // Use standard period (month/quarter/year) but enhance month to use 60-day window for consistency
      if (period === 'month') {
        // Use 60-day rolling window to match transaction summary behavior
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(endDate.getDate() - 60);
      } else {
        // Use standard period for quarter/year
        const periodRange = getAnalyticsPeriod(period);
        startDate = periodRange.start;
        endDate = periodRange.end;
      }
    }

    const options = {
      homeCurrency,
      forceRefresh
    };

    // Calculate analytics with optional trend comparison
    if (includeTrends) {
      const trendsData = await calculateAnalyticsTrends(
        userId,
        { start: startDate, end: endDate },
        options
      );

      return NextResponse.json({
        success: true,
        analytics: trendsData.current,
        trends: trendsData.trends,
        previous_period: trendsData.previous,
        period_info: {
          period,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          home_currency: homeCurrency
        }
      });
    } else {
      const analytics = await calculateFinancialAnalytics(
        userId,
        startDate,
        endDate,
        options
      );

      return NextResponse.json({
        success: true,
        analytics,
        period_info: {
          period,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          home_currency: homeCurrency
        }
      });
    }

  } catch (error) {
    console.error('Analytics API error:', error);
    
    if (error instanceof Error) {
      // Check for specific error types
      if (error.message.includes('Failed to fetch transactions')) {
        return NextResponse.json(
          { error: 'Unable to retrieve transaction data. Please try again.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to calculate financial analytics' },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for batch analytics calculation
 * Useful for pre-calculating analytics for multiple periods
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { periods, homeCurrency = 'SGD', forceRefresh = false } = body;

    if (!Array.isArray(periods) || periods.length === 0) {
      return NextResponse.json(
        { error: 'Periods array is required' },
        { status: 400 }
      );
    }

    if (periods.length > 12) {
      return NextResponse.json(
        { error: 'Maximum 12 periods allowed per batch request' },
        { status: 400 }
      );
    }

    const options = { homeCurrency, forceRefresh };
    const results = [];

    // Process periods sequentially to avoid overwhelming database
    for (const periodInfo of periods) {
      try {
        let startDate: Date;
        let endDate: Date;

        if (periodInfo.start && periodInfo.end) {
          startDate = new Date(periodInfo.start);
          endDate = new Date(periodInfo.end);
        } else if (periodInfo.period) {
          const periodRange = getAnalyticsPeriod(
            periodInfo.period as 'month' | 'quarter' | 'year',
            periodInfo.date ? new Date(periodInfo.date) : undefined
          );
          startDate = periodRange.start;
          endDate = periodRange.end;
        } else {
          results.push({
            error: 'Invalid period specification',
            periodInfo
          });
          continue;
        }

        const analytics = await calculateFinancialAnalytics(
          userId,
          startDate,
          endDate,
          options
        );

        results.push({
          success: true,
          analytics,
          period_info: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            home_currency: homeCurrency
          }
        });

      } catch (error) {
        results.push({
          error: error instanceof Error ? error.message : 'Unknown error',
          periodInfo
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      processed_count: results.length
    });

  } catch (error) {
    console.error('Batch analytics API error:', error);
    return NextResponse.json(
      { error: 'Failed to process batch analytics request' },
      { status: 500 }
    );
  }
}