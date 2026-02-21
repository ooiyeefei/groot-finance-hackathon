/**
 * JSON transformation utilities for LHDN e-Invoice signing.
 *
 * Step 2 of the LHDN 8-step workflow: remove UBLExtensions and Signature
 * elements, then canonicalize (minify) the document.
 */

const UBL_NAMESPACES: Record<string, string> = {
  _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

const LHDN_MARKER = '\0LHDN:';

export function ensureNamespacePrefixes(doc: Record<string, unknown>): Record<string, unknown> {
  if (doc._D && doc._A && doc._B) return doc;
  return { ...UBL_NAMESPACES, ...doc };
}

export function removeSignatureFields(doc: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(doc));
  const invoice = (clone as { Invoice?: Record<string, unknown>[] }).Invoice;
  if (invoice && Array.isArray(invoice) && invoice.length > 0) {
    delete invoice[0].UBLExtensions;
    delete invoice[0].Signature;
  }
  return clone;
}

function formatLhdnNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString() + '.0';
  return String(n);
}

function markNumbers(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return LHDN_MARKER + formatLhdnNumber(value);
  if (Array.isArray(value)) return value.map(markNumbers);
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = markNumbers(v);
    }
    return result;
  }
  return value;
}

export function minifyJson(input: string | Record<string, unknown>): string {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  const marked = markNumbers(obj);
  const json = JSON.stringify(marked);
  // Strip quotes around markers: "\u0000LHDN:1000.0" → 1000.0
  return json.replace(/"\\u0000LHDN:([^"]*)"/g, '$1');
}
