/**
 * Header fingerprint generation for template auto-detection.
 * Produces a deterministic hash from column headers that is:
 * - Order-independent (headers sorted alphabetically)
 * - Case-insensitive (all lowercased)
 * - Compact (SHA-256 hash = 64 chars)
 */

/**
 * Generate a SHA-256 fingerprint from an array of column headers.
 * Same set of headers always produces the same hash, regardless of order or case.
 */
export async function generateFingerprint(headers: string[]): Promise<string> {
  const normalized = headers
    .map((h) => h.toLowerCase().trim())
    .filter((h) => h.length > 0)
    .sort()
    .join("|");

  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
