/**
 * Duplicate Detection Utilities (Convex-compatible)
 *
 * Provides helper functions for duplicate detection queries.
 * File hash calculation happens in Lambda (Node.js runtime).
 */

/**
 * Calculate 90-day window start timestamp
 * @returns Unix timestamp (ms) for 90 days ago
 */
export function getNinetyDaysAgo(): number {
  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  return now - ninetyDaysMs;
}

/**
 * Fuzzy match vendor names (simple Levenshtein distance)
 * @param a - First vendor name
 * @param b - Second vendor name
 * @param threshold - Max distance to consider match (default: 3)
 * @returns true if names are similar
 */
export function fuzzyMatchVendor(a: string, b: string, threshold: number = 3): boolean {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const normA = normalize(a);
  const normB = normalize(b);

  if (normA === normB) return true;

  // Simple Levenshtein distance implementation
  const distance = levenshteinDistance(normA, normB);
  return distance <= threshold;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if amounts are close enough (within 1% or RM 1)
 * Handles floating-point precision and minor OCR errors
 */
export function amountsMatch(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff <= 1.0 || diff / Math.max(a, b) <= 0.01;
}

/**
 * Check if dates are the same
 * @param a - Date string (YYYY-MM-DD)
 * @param b - Date string (YYYY-MM-DD)
 * @returns true if same date
 */
export function datesMatch(a: string, b: string): boolean {
  return a === b;
}
