/**
 * Currency-specific price alert thresholds for vendor price intelligence.
 *
 * Stable currencies (SGD, MYR, USD, EUR) use lower thresholds.
 * Higher-inflation currencies (IDR, VND, PHP, THB) use elevated thresholds
 * to avoid false positives from normal price volatility.
 */

export type AlertLevel = "none" | "info" | "warning" | "alert";

interface PriceThresholds {
  info: number;
  warning: number;
  alert: number;
}

const STABLE_CURRENCY_THRESHOLDS: PriceThresholds = {
  info: 5,
  warning: 10,
  alert: 20,
};

const HIGH_INFLATION_CURRENCY_THRESHOLDS: PriceThresholds = {
  info: 8,
  warning: 15,
  alert: 25,
};

const HIGH_INFLATION_CURRENCIES = new Set(["IDR", "VND", "PHP", "THB"]);

/** Minimum number of historical price observations required before alerting */
export const MIN_OBSERVATIONS_FOR_ALERT = 2;

/** Lookback window in days for price trend analysis */
export const PRICE_LOOKBACK_DAYS = 90;

export function getThresholdsForCurrency(currency: string): PriceThresholds {
  return HIGH_INFLATION_CURRENCIES.has(currency.toUpperCase())
    ? HIGH_INFLATION_CURRENCY_THRESHOLDS
    : STABLE_CURRENCY_THRESHOLDS;
}

export function getAlertLevel(
  percentChange: number,
  currency: string
): AlertLevel {
  if (percentChange <= 0) return "none";

  const thresholds = getThresholdsForCurrency(currency);

  if (percentChange >= thresholds.alert) return "alert";
  if (percentChange >= thresholds.warning) return "warning";
  if (percentChange >= thresholds.info) return "info";
  return "none";
}
