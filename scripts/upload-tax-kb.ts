/**
 * Upload Tax Reference Content to Qdrant
 *
 * Uploads factual tax reference entries (rates, deadlines, thresholds)
 * to the regulatory_kb Qdrant collection.
 *
 * Usage: npx tsx scripts/upload-tax-kb.ts
 */

import { v4 as uuidv4 } from 'uuid';

const QDRANT_URL = process.env.QDRANT_URL || process.env.NEXT_PUBLIC_QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const COLLECTION_NAME = 'regulatory_kb';
const EMBEDDING_MODEL = 'gemini-embedding-001';

interface TaxEntry {
  text: string;
  jurisdiction: 'MY' | 'SG';
  topic: string;
  effective_date: string;
  source: string;
}

// Factual-only tax reference content — NO advisory or optimization advice
const TAX_ENTRIES: TaxEntry[] = [
  // Malaysia Corporate Tax
  {
    text: `Malaysia Corporate Tax Rates (Year of Assessment 2026):
- Standard rate: 24% on chargeable income
- SME preferential rate: 15% on first RM 150,000, 17% on RM 150,001 to RM 600,000, 24% on balance
- SME qualification: Paid-up capital ≤ RM 2.5 million AND gross income ≤ RM 50 million
- Resident company tax applies to companies incorporated in Malaysia or with management and control exercised in Malaysia`,
    jurisdiction: 'MY',
    topic: 'corporate_tax',
    effective_date: '2024-01-01',
    source: 'LHDN (Inland Revenue Board of Malaysia)',
  },
  {
    text: `Malaysia Tax Filing Deadlines:
- Form C (Company Tax Return): Within 7 months from the end of the accounting period
- Form E (Employer Return): Before March 31 each year
- Form CP204 (Estimated Tax Payable): Before the start of the basis period
- Form CP204A (Revised Estimated Tax): In the 6th or 9th month of the basis period
- Monthly Tax Deduction (MTD/PCB): Due by the 15th of the following month
- Withholding tax: Due within 1 month from the date of payment`,
    jurisdiction: 'MY',
    topic: 'filing_deadlines',
    effective_date: '2024-01-01',
    source: 'LHDN (Inland Revenue Board of Malaysia)',
  },
  {
    text: `Malaysia Sales and Service Tax (SST):
- Sales Tax: 5% or 10% on manufactured goods (exemptions apply)
- Service Tax: 8% on prescribed taxable services (effective March 1, 2024, increased from 6%)
- Registration threshold: Taxable turnover exceeds RM 500,000 in a 12-month period
- SST-02 return filing: Bi-monthly (every 2 months)
- Payment due: Last day of the month following the taxable period`,
    jurisdiction: 'MY',
    topic: 'thresholds',
    effective_date: '2024-03-01',
    source: 'Royal Malaysian Customs Department',
  },
  // Singapore GST
  {
    text: `Singapore Goods and Services Tax (GST):
- Standard GST rate: 9% (effective January 1, 2024, increased from 8%)
- Compulsory registration: Taxable turnover exceeds S$1 million in past 12 months, or expected to exceed S$1 million in next 12 months
- Voluntary registration: Available below threshold, requires 2-year commitment
- Zero-rated supplies: Exported goods and international services
- Exempt supplies: Financial services, sale and lease of residential properties`,
    jurisdiction: 'SG',
    topic: 'gst',
    effective_date: '2024-01-01',
    source: 'IRAS (Inland Revenue Authority of Singapore)',
  },
  {
    text: `Singapore GST Filing Calendar:
- Quarterly filing: Due one month after the end of each accounting quarter
- Monthly filing: Due one month after the end of each accounting month (for businesses with >S$5M annual turnover)
- GST return (GST F5): Must be filed electronically via myTax Portal
- Payment: Due by the filing deadline
- Late filing penalty: S$200 per month (up to maximum S$10,000)
- Late payment penalty: 5% on outstanding tax + additional 2% per month (up to 50%)`,
    jurisdiction: 'SG',
    topic: 'filing_deadlines',
    effective_date: '2024-01-01',
    source: 'IRAS (Inland Revenue Authority of Singapore)',
  },
  {
    text: `Singapore Corporate Tax:
- Headline rate: 17% (flat rate, one of the lowest in Asia)
- Partial tax exemption: 75% exemption on first S$10,000, 50% on next S$190,000
- Start-up Tax Exemption (SUTE): 75% exemption on first S$100,000, 50% on next S$100,000 for first 3 YAs
- Qualification for SUTE: ≤ 20 shareholders, all individuals, or at least one holds ≥ 10%
- Estimated chargeable income (ECI): File within 3 months from financial year-end
- Form C-S/C: File by November 30 each year`,
    jurisdiction: 'SG',
    topic: 'corporate_tax',
    effective_date: '2024-01-01',
    source: 'IRAS (Inland Revenue Authority of Singapore)',
  },
];

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

async function upsertToQdrant(id: string, embedding: number[], payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'api-key': QDRANT_API_KEY!,
    },
    body: JSON.stringify({
      points: [{
        id,
        vector: embedding,
        payload,
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Qdrant upsert error: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  console.log('=== Uploading Tax Reference Content to Qdrant ===\n');

  if (!QDRANT_URL || !QDRANT_API_KEY || !GEMINI_API_KEY) {
    console.error('Missing env vars: QDRANT_URL, QDRANT_API_KEY, GEMINI_API_KEY');
    process.exit(1);
  }

  let success = 0;
  let failed = 0;

  for (const entry of TAX_ENTRIES) {
    const id = uuidv4();
    console.log(`Processing: [${entry.jurisdiction}] ${entry.topic}`);

    try {
      // Generate embedding
      const embedding = await generateEmbedding(entry.text);

      // Upload to Qdrant
      await upsertToQdrant(id, embedding, {
        text: entry.text,
        category: 'tax_reference',
        jurisdiction: entry.jurisdiction,
        country: entry.jurisdiction === 'MY' ? 'Malaysia' : 'Singapore',
        topic: entry.topic,
        effective_date: entry.effective_date,
        source: entry.source,
        created_at: new Date().toISOString(),
      });

      console.log(`  ✓ Uploaded (${embedding.length}-dim embedding)\n`);
      success++;
    } catch (error) {
      console.error(`  ✗ Failed: ${error instanceof Error ? error.message : error}\n`);
      failed++;
    }

    // Rate limit: Gemini embedding API
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== Complete: ${success} uploaded, ${failed} failed ===`);
}

main().catch(console.error);
