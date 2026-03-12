/**
 * Deterministic column mapping using alias matching.
 *
 * Matches CSV headers against known aliases in schema definitions.
 * Fast, free, offline — used as first pass before AI fallback.
 */

import type { SchemaType, SchemaField } from "../types";
import {
  SALES_STATEMENT_FIELDS,
  BANK_STATEMENT_FIELDS,
  PURCHASE_ORDER_FIELDS,
  GRN_FIELDS,
} from "./schema-definitions";

interface AliasMatch {
  sourceHeader: string;
  targetField: string;
  confidence: number;
}

interface AliasMatchResult {
  detectedSchemaType: SchemaType;
  schemaConfidence: number;
  mappings: AliasMatch[];
  unmatchedHeaders: string[];
}

/**
 * Normalize a header for comparison: lowercase, trim, remove special chars.
 */
function normalize(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[_\-\.\/\\]/g, " ") // replace separators with space
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

/**
 * Score how well a header matches a field's aliases.
 * Returns 0 if no match, 0.5-1.0 based on match quality.
 */
function scoreMatch(normalizedHeader: string, field: SchemaField): number {
  const headerLower = normalizedHeader;

  for (const alias of field.aliases) {
    const normalizedAlias = normalize(alias);

    // Exact match → highest confidence
    if (headerLower === normalizedAlias) return 1.0;
  }

  for (const alias of field.aliases) {
    const normalizedAlias = normalize(alias);

    // Header contains the alias (e.g., "total order amount" contains "total amount")
    if (headerLower.includes(normalizedAlias) && normalizedAlias.length >= 3) {
      return 0.85;
    }

    // Alias contains the header (e.g., alias "transaction date" contains header "date")
    if (normalizedAlias.includes(headerLower) && headerLower.length >= 3) {
      return 0.7;
    }
  }

  // Check field name itself as a last resort
  const normalizedFieldName = normalize(field.name);
  if (headerLower === normalizedFieldName) return 0.9;
  if (headerLower.includes(normalizedFieldName) && normalizedFieldName.length >= 3) {
    return 0.6;
  }

  return 0;
}

/**
 * Match headers against a specific schema's fields.
 * Returns mappings and a schema-level score (0-1).
 */
function matchAgainstSchema(
  headers: string[],
  fields: SchemaField[]
): { mappings: AliasMatch[]; schemaScore: number } {
  const normalizedHeaders = headers.map(normalize);
  const usedFields = new Set<string>();
  const mappings: AliasMatch[] = [];

  // Score all header-field pairs
  const scores: Array<{
    headerIdx: number;
    fieldIdx: number;
    score: number;
  }> = [];

  for (let hi = 0; hi < normalizedHeaders.length; hi++) {
    for (let fi = 0; fi < fields.length; fi++) {
      const score = scoreMatch(normalizedHeaders[hi], fields[fi]);
      if (score > 0) {
        scores.push({ headerIdx: hi, fieldIdx: fi, score });
      }
    }
  }

  // Greedy assignment: best scores first, no double-assignment
  scores.sort((a, b) => b.score - a.score);
  const assignedHeaders = new Set<number>();

  for (const { headerIdx, fieldIdx, score } of scores) {
    if (assignedHeaders.has(headerIdx) || usedFields.has(fields[fieldIdx].name)) {
      continue;
    }
    assignedHeaders.add(headerIdx);
    usedFields.add(fields[fieldIdx].name);
    mappings.push({
      sourceHeader: headers[headerIdx],
      targetField: fields[fieldIdx].name,
      confidence: score,
    });
  }

  // Add unmapped headers
  for (let i = 0; i < headers.length; i++) {
    if (!assignedHeaders.has(i)) {
      mappings.push({
        sourceHeader: headers[i],
        targetField: "unmapped",
        confidence: 0,
      });
    }
  }

  // Schema score: weighted by required field coverage
  const requiredFields = fields.filter((f) => f.required);
  const matchedRequired = requiredFields.filter((f) =>
    usedFields.has(f.name)
  ).length;
  const requiredCoverage =
    requiredFields.length > 0 ? matchedRequired / requiredFields.length : 0;
  const totalMatched = mappings.filter(
    (m) => m.targetField !== "unmapped"
  ).length;
  const totalCoverage = totalMatched / Math.max(fields.length, 1);

  // Schema score weights required fields more heavily
  const schemaScore = requiredCoverage * 0.7 + totalCoverage * 0.3;

  return { mappings, schemaScore };
}

/**
 * Try to match headers using deterministic alias matching.
 *
 * Auto-detects schema type by scoring against both schemas and
 * picking the best fit. Returns unmatched headers for AI fallback.
 */
export function matchByAlias(headers: string[]): AliasMatchResult {
  const candidates: Array<{ type: SchemaType; result: ReturnType<typeof matchAgainstSchema> }> = [
    { type: "sales_statement", result: matchAgainstSchema(headers, SALES_STATEMENT_FIELDS) },
    { type: "bank_statement", result: matchAgainstSchema(headers, BANK_STATEMENT_FIELDS) },
    { type: "purchase_order", result: matchAgainstSchema(headers, PURCHASE_ORDER_FIELDS) },
    { type: "goods_received_note", result: matchAgainstSchema(headers, GRN_FIELDS) },
  ];

  // Pick the schema with the highest score
  candidates.sort((a, b) => b.result.schemaScore - a.result.schemaScore);
  const best = candidates[0];

  const unmatchedHeaders = best.result.mappings
    .filter((m) => m.targetField === "unmapped")
    .map((m) => m.sourceHeader);

  return {
    detectedSchemaType: best.type,
    schemaConfidence: best.result.schemaScore,
    mappings: best.result.mappings,
    unmatchedHeaders,
  };
}

/**
 * Check if alias matching is "good enough" to skip AI.
 * Criteria: all required fields mapped AND >= 50% overall coverage.
 */
export function isAliasMatchSufficient(result: AliasMatchResult): boolean {
  const schemaMap: Record<SchemaType, SchemaField[]> = {
    sales_statement: SALES_STATEMENT_FIELDS,
    bank_statement: BANK_STATEMENT_FIELDS,
    purchase_order: PURCHASE_ORDER_FIELDS,
    goods_received_note: GRN_FIELDS,
  };
  const fields = schemaMap[result.detectedSchemaType] ?? BANK_STATEMENT_FIELDS;
  const requiredFields = fields.filter((f) => f.required);

  const mappedRequired = requiredFields.filter((rf) =>
    result.mappings.some(
      (m) => m.targetField === rf.name && m.confidence >= 0.6
    )
  );

  const totalMapped = result.mappings.filter(
    (m) => m.targetField !== "unmapped"
  ).length;
  const coverage = totalMapped / Math.max(result.mappings.length, 1);

  return (
    mappedRequired.length === requiredFields.length &&
    coverage >= 0.5 &&
    result.schemaConfidence >= 0.5
  );
}
