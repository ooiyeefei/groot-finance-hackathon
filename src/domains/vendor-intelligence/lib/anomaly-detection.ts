/**
 * Tier 1 Anomaly Detection — Rule-Based
 *
 * Fixed threshold checks for price anomalies:
 * - Per-invoice: >10% increase from last invoice
 * - Trailing average: >20% increase over 6-month average
 * - New item: Item not in historical data for vendor
 * - Frequency change: Billing frequency deviates >=50%
 *
 * These run first (instant, free). Handles 60-80% of cases.
 * Tier 2 (DSPy adaptive) handles the remaining long tail.
 *
 * Feature: 001-smart-vendor-intelligence (#320)
 */

import {
  getAlertLevel,
  MIN_OBSERVATIONS_FOR_ALERT,
} from "@/domains/payables/lib/price-thresholds";

export type AlertType =
  | "per-invoice"
  | "trailing-average"
  | "new-item"
  | "frequency-change";

export type SeverityLevel = "standard" | "high-impact";

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  alertType: AlertType;
  severityLevel: SeverityLevel;
  oldValue: number;
  newValue: number;
  percentageChange: number;
  itemIdentifier?: string;
}

export interface PriceRecord {
  unitPrice: number;
  invoiceDate: string;
  currency: string;
  itemIdentifier?: string;
}

/**
 * Detect per-invoice price anomaly: >10% increase from last invoice.
 * Maps to spec FR-003(a).
 */
export function detectPerInvoiceAnomaly(
  currentPrice: number,
  lastPrice: number,
  currency: string
): AnomalyDetectionResult | null {
  if (lastPrice <= 0 || currentPrice <= 0) return null;

  const percentChange = ((currentPrice - lastPrice) / lastPrice) * 100;

  // Use existing currency-aware thresholds
  const alertLevel = getAlertLevel(percentChange, currency);

  if (alertLevel === "none") return null;

  return {
    isAnomaly: true,
    alertType: "per-invoice",
    severityLevel: alertLevel === "alert" ? "high-impact" : "standard",
    oldValue: lastPrice,
    newValue: currentPrice,
    percentageChange: Math.round(percentChange * 10) / 10,
  };
}

/**
 * Detect trailing average anomaly: >20% increase over 6-month average.
 * Maps to spec FR-003(b).
 */
export function detectTrailingAverageAnomaly(
  currentPrice: number,
  historicalPrices: PriceRecord[],
  currency: string
): AnomalyDetectionResult | null {
  if (historicalPrices.length < MIN_OBSERVATIONS_FOR_ALERT) return null;

  // Filter to last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0];

  const recentPrices = historicalPrices.filter(
    (p) => (p.invoiceDate ?? "") >= sixMonthsAgoStr
  );

  if (recentPrices.length < MIN_OBSERVATIONS_FOR_ALERT) return null;

  const avgPrice =
    recentPrices.reduce((sum, p) => sum + p.unitPrice, 0) /
    recentPrices.length;

  if (avgPrice <= 0) return null;

  const percentChange = ((currentPrice - avgPrice) / avgPrice) * 100;

  // Only flag if >20% (high-impact threshold)
  if (percentChange <= 20) return null;

  return {
    isAnomaly: true,
    alertType: "trailing-average",
    severityLevel: "high-impact",
    oldValue: Math.round(avgPrice * 100) / 100,
    newValue: currentPrice,
    percentageChange: Math.round(percentChange * 10) / 10,
  };
}

/**
 * Detect new item anomaly: Item not in historical data for this vendor.
 * Maps to spec FR-005.
 */
export function detectNewItemAnomaly(
  currentPrice: number,
  existingRecordCount: number,
  itemIdentifier: string
): AnomalyDetectionResult | null {
  // Only flag as new if truly first observation
  if (existingRecordCount > 0) return null;

  return {
    isAnomaly: true,
    alertType: "new-item",
    severityLevel: "standard",
    oldValue: 0,
    newValue: currentPrice,
    percentageChange: 100, // 100% = brand new
    itemIdentifier,
  };
}

/**
 * Run all Tier 1 anomaly checks on a new price observation.
 * Returns array of detected anomalies (can be multiple for same observation).
 */
export function runTier1AnomalyDetection(params: {
  currentPrice: number;
  currency: string;
  itemIdentifier: string;
  existingRecordsForItem: PriceRecord[];
  existingRecordCount: number;
}): AnomalyDetectionResult[] {
  const {
    currentPrice,
    currency,
    itemIdentifier,
    existingRecordsForItem,
    existingRecordCount,
  } = params;

  const anomalies: AnomalyDetectionResult[] = [];

  // Check 1: New item detection (FR-005)
  const newItemAnomaly = detectNewItemAnomaly(
    currentPrice,
    existingRecordCount,
    itemIdentifier
  );
  if (newItemAnomaly) {
    anomalies.push(newItemAnomaly);
    return anomalies; // New item — skip per-invoice and trailing checks
  }

  // Suppress anomaly alerts for vendors with <2 invoices (FR-024)
  if (existingRecordCount < MIN_OBSERVATIONS_FOR_ALERT) {
    return anomalies;
  }

  // Sort by date descending to get most recent
  const sorted = [...existingRecordsForItem].sort((a, b) =>
    (b.invoiceDate ?? "").localeCompare(a.invoiceDate ?? "")
  );

  // Check 2: Per-invoice anomaly (FR-003a)
  if (sorted.length > 0) {
    const lastPrice = sorted[0].unitPrice;
    const perInvoiceAnomaly = detectPerInvoiceAnomaly(
      currentPrice,
      lastPrice,
      currency
    );
    if (perInvoiceAnomaly) {
      perInvoiceAnomaly.itemIdentifier = itemIdentifier;
      anomalies.push(perInvoiceAnomaly);
    }
  }

  // Check 3: Trailing average anomaly (FR-003b)
  const trailingAnomaly = detectTrailingAverageAnomaly(
    currentPrice,
    existingRecordsForItem,
    currency
  );
  if (trailingAnomaly) {
    trailingAnomaly.itemIdentifier = itemIdentifier;
    anomalies.push(trailingAnomaly);
  }

  return anomalies;
}
