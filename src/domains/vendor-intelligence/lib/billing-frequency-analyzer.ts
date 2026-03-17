/**
 * T073: Billing Frequency Change Detection
 *
 * Detects when a vendor's billing frequency deviates ≥50% from historical average.
 * e.g., monthly → biweekly = 100% increase, quarterly → monthly = 200% increase.
 *
 * Feature: 001-smart-vendor-intelligence (#320), FR-006
 */

export type PotentialIndicator =
  | "cash-flow-issues"
  | "billing-errors"
  | "contract-violations";

export interface FrequencyChangeResult {
  isAnomaly: boolean;
  oldFrequencyDays: number;
  newFrequencyDays: number;
  percentageChange: number;
  potentialIndicators: PotentialIndicator[];
}

/**
 * Analyze billing frequency changes for a vendor.
 *
 * @param invoiceDates - Array of invoice dates (ISO strings), sorted ascending
 * @param minObservations - Minimum number of invoices needed (default: 4)
 * @returns FrequencyChangeResult or null if insufficient data
 */
export function detectBillingFrequencyChange(
  invoiceDates: string[],
  minObservations: number = 4
): FrequencyChangeResult | null {
  if (invoiceDates.length < minObservations) return null;

  // Calculate intervals between consecutive invoices (in days)
  const intervals: number[] = [];
  for (let i = 1; i < invoiceDates.length; i++) {
    const d1 = new Date(invoiceDates[i - 1]);
    const d2 = new Date(invoiceDates[i]);
    const daysDiff = Math.round(
      (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff > 0) {
      intervals.push(daysDiff);
    }
  }

  if (intervals.length < 3) return null;

  // Historical average (all except last interval)
  const historicalIntervals = intervals.slice(0, -1);
  const historicalAvg =
    historicalIntervals.reduce((s, d) => s + d, 0) /
    historicalIntervals.length;

  if (historicalAvg <= 0) return null;

  // Latest interval
  const latestInterval = intervals[intervals.length - 1];

  // Calculate percentage change
  const percentChange =
    ((latestInterval - historicalAvg) / historicalAvg) * 100;

  // Only flag if ≥50% deviation (FR-006)
  if (Math.abs(percentChange) < 50) return null;

  // Determine potential indicators based on pattern
  const potentialIndicators: PotentialIndicator[] = [];

  if (percentChange < -30) {
    // Billing more frequently than usual
    potentialIndicators.push("cash-flow-issues"); // Vendor might need cash sooner
    potentialIndicators.push("billing-errors"); // Possible duplicate billing
  }

  if (percentChange > 50) {
    // Billing less frequently than usual
    potentialIndicators.push("contract-violations"); // Not invoicing per contract terms
  }

  // Check for very irregular pattern (high variance)
  const variance =
    historicalIntervals.reduce(
      (s, d) => s + Math.pow(d - historicalAvg, 2),
      0
    ) / historicalIntervals.length;
  const cv = (Math.sqrt(variance) / historicalAvg) * 100;
  if (cv > 50) {
    potentialIndicators.push("billing-errors"); // Irregular pattern suggests errors
  }

  return {
    isAnomaly: true,
    oldFrequencyDays: Math.round(historicalAvg),
    newFrequencyDays: latestInterval,
    percentageChange: Math.round(percentChange * 10) / 10,
    potentialIndicators: [...new Set(potentialIndicators)], // Deduplicate
  };
}
