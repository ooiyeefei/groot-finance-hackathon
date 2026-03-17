/**
 * T076: Price Normalizer
 *
 * Handles different units (per-piece vs per-box) for price comparison.
 * Displays warning when units don't match.
 *
 * Feature: 001-smart-vendor-intelligence (#320)
 */

export interface NormalizedPrice {
  unitPrice: number;
  normalizedUnit: string;
  originalUnit?: string;
  wasNormalized: boolean;
  warning?: string;
}

const UNIT_PATTERNS: Record<string, { regex: RegExp; factor: number; normalizedUnit: string }[]> = {
  piece: [
    { regex: /\bpc[s]?\b|\bpiece[s]?\b|\bunit[s]?\b|\beach\b/i, factor: 1, normalizedUnit: "pc" },
  ],
  box: [
    { regex: /\bbox(es)?\b|\bcarton[s]?\b|\bcase[s]?\b/i, factor: 1, normalizedUnit: "box" },
  ],
  pack: [
    { regex: /\bpack[s]?\b|\bpkg[s]?\b|\bpackage[s]?\b/i, factor: 1, normalizedUnit: "pack" },
  ],
  kg: [
    { regex: /\bkg[s]?\b|\bkilogram[s]?\b/i, factor: 1, normalizedUnit: "kg" },
    { regex: /\bg[s]?\b|\bgram[s]?\b/i, factor: 0.001, normalizedUnit: "kg" },
  ],
  liter: [
    { regex: /\bl(iter)?[s]?\b|\blitre[s]?\b/i, factor: 1, normalizedUnit: "L" },
    { regex: /\bml[s]?\b|\bmilliliter[s]?\b/i, factor: 0.001, normalizedUnit: "L" },
  ],
  meter: [
    { regex: /\bm(eter)?[s]?\b/i, factor: 1, normalizedUnit: "m" },
    { regex: /\bcm[s]?\b/i, factor: 0.01, normalizedUnit: "m" },
    { regex: /\bmm[s]?\b/i, factor: 0.001, normalizedUnit: "m" },
  ],
};

/**
 * Extract unit from item description.
 */
export function extractUnit(description: string): string | null {
  for (const [, patterns] of Object.entries(UNIT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.regex.test(description)) {
        return pattern.normalizedUnit;
      }
    }
  }
  return null;
}

/**
 * Check if two items have mismatched units.
 * Returns a warning message if units don't match, null otherwise.
 */
export function checkUnitMismatch(
  descriptionA: string,
  descriptionB: string
): string | null {
  const unitA = extractUnit(descriptionA);
  const unitB = extractUnit(descriptionB);

  if (!unitA || !unitB) return null; // Can't determine units
  if (unitA === unitB) return null; // Units match

  return `Unit mismatch: "${descriptionA}" uses ${unitA}, "${descriptionB}" uses ${unitB}. Direct price comparison may not be accurate.`;
}

/**
 * Detect if price history records have mixed units for the same item.
 */
export function detectMixedUnits(
  records: Array<{ itemDescription: string; unitPrice: number }>
): { hasMixedUnits: boolean; warning?: string; units: string[] } {
  const detectedUnits = new Set<string>();

  for (const record of records) {
    const unit = extractUnit(record.itemDescription);
    if (unit) detectedUnits.add(unit);
  }

  const units = [...detectedUnits];

  if (units.length <= 1) {
    return { hasMixedUnits: false, units };
  }

  return {
    hasMixedUnits: true,
    warning: `Mixed units detected (${units.join(", ")}). Price comparison may not be accurate.`,
    units,
  };
}
