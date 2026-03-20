/**
 * Memory Candidate Detector (T033)
 *
 * Heuristics to identify memory-worthy facts in conversation:
 * - Frequency of mention
 * - Presence of "always/never/prefer" keywords
 * - References to people/dates/amounts
 */

export interface MemoryCandidate {
  content: string;
  confidence: number; // 0.0-1.0
  reason: string;
  type: 'preference' | 'fact' | 'context' | 'instruction';
}

/**
 * Keywords indicating memory-worthy statements
 */
const PREFERENCE_KEYWORDS = [
  'prefer',
  'always',
  'never',
  'usually',
  'typically',
  'like to',
  'want to',
  'should',
  'must',
];

const PEOPLE_KEYWORDS = [
  'handles',
  'responsible',
  'reports to',
  'manages',
  'approves',
  'team member',
  'colleague',
];

const BUSINESS_FACTS_KEYWORDS = [
  'our company',
  'we use',
  'our process',
  'our workflow',
  'business',
  'fiscal year',
];

/**
 * Detect memory candidates from conversation text
 *
 * @param text - User or assistant message text
 * @param role - Message role ('user' or 'assistant')
 * @returns Array of memory candidates
 */
export function detectMemoryCandidates(text: string, role: 'user' | 'assistant'): MemoryCandidate[] {
  // Only detect from user messages (not assistant responses)
  if (role !== 'user') {
    return [];
  }

  const candidates: MemoryCandidate[] = [];
  const lowerText = text.toLowerCase();

  // Heuristic 1: Preference statements
  for (const keyword of PREFERENCE_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      const sentences = extractSentencesWithKeyword(text, keyword);
      for (const sentence of sentences) {
        candidates.push({
          content: sentence,
          confidence: 0.8,
          reason: `Contains preference keyword: "${keyword}"`,
          type: 'preference',
        });
      }
    }
  }

  // Heuristic 2: Team/people mentions
  for (const keyword of PEOPLE_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      const sentences = extractSentencesWithKeyword(text, keyword);
      for (const sentence of sentences) {
        candidates.push({
          content: sentence,
          confidence: 0.75,
          reason: `References team member or role: "${keyword}"`,
          type: 'fact',
        });
      }
    }
  }

  // Heuristic 3: Business facts
  for (const keyword of BUSINESS_FACTS_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      const sentences = extractSentencesWithKeyword(text, keyword);
      for (const sentence of sentences) {
        candidates.push({
          content: sentence,
          confidence: 0.7,
          reason: `Business fact or process: "${keyword}"`,
          type: 'fact',
        });
      }
    }
  }

  // Heuristic 4: Amounts and dates (high-value facts)
  if (containsAmountOrDate(text)) {
    const sentences = extractSentencesWithAmountsOrDates(text);
    for (const sentence of sentences) {
      candidates.push({
        content: sentence,
        confidence: 0.85,
        reason: 'Contains specific amount or date',
        type: 'fact',
      });
    }
  }

  // Deduplicate and filter by confidence threshold
  const deduplicated = deduplicateCandidates(candidates);
  const filtered = deduplicated.filter((c) => c.confidence >= 0.7);

  console.log(`[MemoryCandidateDetector] Found ${filtered.length} candidates from text of length ${text.length}`);

  return filtered.slice(0, 3); // Limit to top 3 per message
}

/**
 * Extract sentences containing a specific keyword
 */
function extractSentencesWithKeyword(text: string, keyword: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const lowerKeyword = keyword.toLowerCase();

  return sentences
    .filter((s) => s.toLowerCase().includes(lowerKeyword))
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && s.length < 200); // Reasonable length
}

/**
 * Check if text contains amounts or dates
 */
function containsAmountOrDate(text: string): boolean {
  // Currency amounts: $100, RM50, THB1000, USD 50, etc.
  const amountPattern = /[$₹£€¥₹฿]\s?\d+|[A-Z]{3}\s?\d+|\d+\s?(?:dollar|ringgit|baht)/i;

  // Dates: 2025-01-15, Jan 15, 15/01/2025, etc.
  const datePattern = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}/i;

  return amountPattern.test(text) || datePattern.test(text);
}

/**
 * Extract sentences containing amounts or dates
 */
function extractSentencesWithAmountsOrDates(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  return sentences
    .filter((s) => containsAmountOrDate(s))
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && s.length < 200);
}

/**
 * Deduplicate candidates by content similarity
 */
function deduplicateCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
  const unique: MemoryCandidate[] = [];

  for (const candidate of candidates) {
    const isDuplicate = unique.some(
      (u) =>
        u.content.toLowerCase() === candidate.content.toLowerCase() ||
        levenshteinDistance(u.content, candidate.content) < 20
    );

    if (!isDuplicate) {
      unique.push(candidate);
    }
  }

  return unique;
}

/**
 * Simple Levenshtein distance for deduplication
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
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
