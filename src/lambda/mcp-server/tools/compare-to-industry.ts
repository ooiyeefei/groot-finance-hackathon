/**
 * compare_to_industry MCP Tool (031-chat-cross-biz-voice)
 *
 * Compares a business's financial metrics against anonymized industry benchmarks.
 * Returns percentile ranking, averages, and recommendations.
 * Business must be opted in. Minimum 10 peers required.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api.js';
import { Id } from '../../../../convex/_generated/dataModel.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  CompareToIndustryInput,
  CompareToIndustryOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';

const MINIMUM_SAMPLE_SIZE = 10;

const METRIC_LABELS: Record<string, string> = {
  gross_margin: 'Gross Margin',
  cogs_ratio: 'COGS Ratio',
  opex_ratio: 'Operating Expense Ratio',
  ar_days: 'AR Days Outstanding',
  ap_days: 'AP Days Outstanding',
};

let convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error('NEXT_PUBLIC_CONVEX_URL is required');
    convexClient = new ConvexHttpClient(url);
  }
  return convexClient;
}

function getCurrentPeriod(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${quarter}`;
}

function generateRecommendations(
  metric: string,
  percentile: number,
  businessValue: number,
  industryAvg: number
): string[] {
  const recommendations: string[] = [];
  const label = METRIC_LABELS[metric] || metric;

  if (percentile >= 75) {
    recommendations.push(`Your ${label} is in the top quartile — strong performance relative to peers.`);
    recommendations.push('Consider documenting your practices as best practices for the team.');
  } else if (percentile >= 50) {
    recommendations.push(`Your ${label} is above the industry median — solid but room for improvement.`);
    if (metric === 'cogs_ratio' || metric === 'opex_ratio') {
      recommendations.push('Look into vendor renegotiation or process automation to move into the top quartile.');
    }
    if (metric === 'ar_days') {
      recommendations.push('Tightening payment terms or improving follow-up could reduce AR days further.');
    }
  } else if (percentile >= 25) {
    recommendations.push(`Your ${label} is below the industry median — this area needs attention.`);
    if (metric === 'gross_margin') {
      recommendations.push('Review pricing strategy and cost structure. The industry average is ' + (industryAvg * 100).toFixed(1) + '%.');
    }
    if (metric === 'ap_days') {
      recommendations.push('Consider negotiating longer payment terms with suppliers to improve cash flow.');
    }
  } else {
    recommendations.push(`Your ${label} is in the bottom quartile — significant gap from industry peers.`);
    recommendations.push(`Industry average: ${metric.includes('days') ? industryAvg.toFixed(0) + ' days' : (industryAvg * 100).toFixed(1) + '%'}. This should be a priority area for improvement.`);
  }

  return recommendations;
}

export async function compareToIndustry(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<CompareToIndustryOutput | MCPErrorResponse> {
  const input = args as CompareToIndustryInput;

  if (!authContext) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Authentication required' };
  }

  const businessId = authContext.businessId;
  if (!businessId) {
    return { error: true, code: 'INVALID_INPUT', message: 'Business context required' };
  }

  const convex = getConvexClient();

  // Check opt-in status
  const optIn = await convex.query(api.functions.benchmarking.getOptInStatus, {
    businessId: businessId as Id<"businesses">,
  });

  if (!optIn || !optIn.isActive) {
    return {
      success: false,
      reason: 'not_opted_in',
      message: 'Your business is not opted in to benchmarking. Benchmarking compares your anonymized financial metrics against similar businesses in your industry. Only aggregated statistics are shared — never individual business data. Would you like to opt in?',
    };
  }

  const period = input.period || getCurrentPeriod();

  // Compute this business's own metric
  const now = new Date();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);

  let businessMetrics;
  try {
    businessMetrics = await convex.query(api.functions.benchmarking.computeBusinessMetrics, {
      businessId: businessId as Id<"businesses">,
      periodStart: quarterStart.toISOString().split('T')[0],
      periodEnd: quarterEnd.toISOString().split('T')[0],
    });
  } catch {
    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: 'Failed to compute your business metrics. Please try again.',
    };
  }

  const businessValue = businessMetrics[input.metric as keyof typeof businessMetrics] ?? 0;

  // Fetch pre-computed aggregates
  let aggregates;
  try {
    aggregates = await convex.query(api.functions.benchmarking.getAggregates, {
      industryGroup: optIn.industryGroup,
      metric: input.metric,
      period,
    });
  } catch {
    // Aggregates not yet computed
  }

  if (!aggregates || aggregates.sampleSize < MINIMUM_SAMPLE_SIZE) {
    return {
      success: false,
      reason: 'insufficient_data',
      message: `Not enough businesses in your industry (${optIn.industryLabel}) have opted in yet for meaningful comparisons. We need at least ${MINIMUM_SAMPLE_SIZE} businesses — currently ${aggregates?.sampleSize ?? 0}.`,
      current_sample_size: aggregates?.sampleSize ?? 0,
      minimum_required: MINIMUM_SAMPLE_SIZE,
    };
  }

  // Calculate percentile position
  let percentile: number;
  const isHigherBetter = ['gross_margin'].includes(input.metric);
  const isLowerBetter = ['cogs_ratio', 'opex_ratio', 'ar_days', 'ap_days'].includes(input.metric);

  if (isLowerBetter) {
    // Lower value = better rank = higher percentile
    if (businessValue <= aggregates.p10) percentile = 95;
    else if (businessValue <= aggregates.p25) percentile = 80;
    else if (businessValue <= aggregates.median) percentile = 60;
    else if (businessValue <= aggregates.p75) percentile = 35;
    else if (businessValue <= aggregates.p90) percentile = 15;
    else percentile = 5;
  } else {
    // Higher value = better rank = higher percentile (default)
    if (businessValue >= aggregates.p90) percentile = 95;
    else if (businessValue >= aggregates.p75) percentile = 80;
    else if (businessValue >= aggregates.median) percentile = 60;
    else if (businessValue >= aggregates.p25) percentile = 35;
    else if (businessValue >= aggregates.p10) percentile = 15;
    else percentile = 5;
  }

  const recommendations = generateRecommendations(
    input.metric,
    percentile,
    businessValue,
    aggregates.average
  );

  return {
    success: true,
    metric: input.metric,
    business_value: businessValue,
    industry_group: optIn.industryLabel,
    percentile,
    industry_average: aggregates.average,
    industry_median: aggregates.median,
    p25: aggregates.p25,
    p75: aggregates.p75,
    sample_size: aggregates.sampleSize,
    period,
    recommendations,
  };
}
