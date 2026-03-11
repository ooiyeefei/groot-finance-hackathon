/**
 * CSV Column Mapping Suggestion API (Hybrid)
 *
 * 1. Alias matching (instant, deterministic) — tries known column name patterns
 * 2. Gemini 3.1 Flash Lite fallback — only called when alias matching is insufficient
 *
 * @route POST /api/v1/csv-parser/suggest-mappings
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  SALES_STATEMENT_FIELDS,
  BANK_STATEMENT_FIELDS,
} from "@/lib/csv-parser/lib/schema-definitions";
import {
  matchByAlias,
  isAliasMatchSufficient,
} from "@/lib/csv-parser/lib/alias-matcher";
import type { SchemaType } from "@/lib/csv-parser/types";

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { headers, sampleRows, schemaType = "auto" } = body as {
      headers?: string[];
      sampleRows?: Record<string, string>[];
      schemaType?: SchemaType | "auto";
    };

    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return NextResponse.json(
        { success: false, error: "headers array is required" },
        { status: 400 }
      );
    }

    if (!sampleRows || !Array.isArray(sampleRows) || sampleRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "sampleRows array is required" },
        { status: 400 }
      );
    }

    // --- Step 1: Try alias matching (instant) ---
    const aliasResult = matchByAlias(headers);

    // If a specific schema type was requested, override detection
    const effectiveSchemaType =
      schemaType !== "auto" ? schemaType : aliasResult.detectedSchemaType;

    if (isAliasMatchSufficient(aliasResult)) {
      console.log(
        `[CSV Parser] Alias match sufficient — ${aliasResult.unmatchedHeaders.length} unmatched of ${headers.length} headers`
      );
      return NextResponse.json({
        success: true,
        data: {
          detectedSchemaType: effectiveSchemaType,
          schemaConfidence: aliasResult.schemaConfidence,
          mappings: aliasResult.mappings,
          source: "alias",
        },
      });
    }

    // --- Step 2: Gemini AI fallback for unmatched headers ---
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      // No API key configured — return alias results as-is
      console.warn("[CSV Parser] GEMINI_API_KEY not set, returning alias-only results");
      return NextResponse.json({
        success: true,
        data: {
          detectedSchemaType: effectiveSchemaType,
          schemaConfidence: aliasResult.schemaConfidence,
          mappings: aliasResult.mappings,
          source: "alias_only",
        },
      });
    }

    console.log(
      `[CSV Parser] Alias match insufficient (${aliasResult.unmatchedHeaders.length} unmatched) — calling Gemini fallback`
    );

    const prompt = buildMappingPrompt(
      headers,
      sampleRows.slice(0, 5),
      schemaType
    );

    const geminiPayload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: "You are a data mapping assistant. You analyze CSV column headers and sample data to suggest mappings to standard financial fields. Always respond with valid JSON only, no markdown or explanation.",
          },
        ],
      },
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    };

    const geminiResponse = await fetch(`${GEMINI_URL}?key=${geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload),
      signal: AbortSignal.timeout(15000),
    });

    if (!geminiResponse.ok) {
      console.error(
        "[CSV Parser] Gemini API error:",
        geminiResponse.status,
        await geminiResponse.text()
      );
      // Fall back to alias results on API error
      return NextResponse.json({
        success: true,
        data: {
          detectedSchemaType: effectiveSchemaType,
          schemaConfidence: aliasResult.schemaConfidence,
          mappings: aliasResult.mappings,
          source: "alias_fallback",
        },
      });
    }

    const geminiResult = await geminiResponse.json();
    const content =
      geminiResult.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const parsed = parseGeminiResponse(content, headers);

    return NextResponse.json({
      success: true,
      data: {
        detectedSchemaType:
          schemaType !== "auto" ? schemaType : parsed.detectedSchemaType,
        schemaConfidence: parsed.schemaConfidence,
        mappings: parsed.mappings,
        source: "gemini",
      },
    });
  } catch (error) {
    console.error("[CSV Parser] Suggest mappings error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate mapping suggestions" },
      { status: 500 }
    );
  }
}

function buildMappingPrompt(
  headers: string[],
  sampleRows: Record<string, string>[],
  schemaType: SchemaType | "auto"
): string {
  const salesFields = SALES_STATEMENT_FIELDS.map(
    (f) =>
      `  - ${f.name} (${f.label}): ${f.type}, ${f.required ? "REQUIRED" : "optional"}. Common names: ${f.aliases.join(", ")}`
  ).join("\n");

  const bankFields = BANK_STATEMENT_FIELDS.map(
    (f) =>
      `  - ${f.name} (${f.label}): ${f.type}, ${f.required ? "REQUIRED" : "optional"}. Common names: ${f.aliases.join(", ")}`
  ).join("\n");

  const sampleData = sampleRows
    .slice(0, 3)
    .map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`)
    .join("\n");

  let schemaInstruction: string;
  if (schemaType === "auto") {
    schemaInstruction = `First, determine if this is a Sales Statement or Bank Statement based on the headers and data.

Sales Statement fields:
${salesFields}

Bank Statement fields:
${bankFields}`;
  } else {
    const fields =
      schemaType === "sales_statement" ? salesFields : bankFields;
    schemaInstruction = `This is a ${schemaType === "sales_statement" ? "Sales Statement" : "Bank Statement"}.

Target fields:
${fields}`;
  }

  return `Analyze these CSV column headers and sample data, then map each column to the most appropriate standard field.

Column headers: ${JSON.stringify(headers)}

Sample data:
${sampleData}

${schemaInstruction}

Respond with ONLY this JSON structure:
{
  "detectedSchemaType": "sales_statement" or "bank_statement",
  "schemaConfidence": 0.0 to 1.0,
  "mappings": [
    {
      "sourceHeader": "exact column header",
      "targetField": "standard field name or unmapped",
      "confidence": 0.0 to 1.0
    }
  ]
}

Rules:
- Map EVERY source header to a target field or "unmapped"
- Use exact sourceHeader strings from the input
- Confidence 0.9+ for obvious matches, 0.5-0.8 for reasonable guesses, below 0.5 for uncertain
- Required fields should be mapped first if possible
- Only use target field names from the schema above`;
}

function parseGeminiResponse(
  content: string,
  headers: string[]
): {
  detectedSchemaType: SchemaType;
  schemaConfidence: number;
  mappings: Array<{
    sourceHeader: string;
    targetField: string;
    confidence: number;
  }>;
} {
  try {
    let jsonStr = content.trim();
    // Handle markdown code blocks if responseMimeType didn't work
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    const detectedSchemaType: SchemaType =
      parsed.detectedSchemaType === "bank_statement"
        ? "bank_statement"
        : "sales_statement";

    const schemaConfidence = Math.max(
      0,
      Math.min(1, Number(parsed.schemaConfidence) || 0.5)
    );

    const mappings = headers.map((header) => {
      const found = parsed.mappings?.find(
        (m: { sourceHeader: string }) => m.sourceHeader === header
      );
      return {
        sourceHeader: header,
        targetField: found?.targetField || "unmapped",
        confidence: Math.max(0, Math.min(1, Number(found?.confidence) || 0)),
      };
    });

    return { detectedSchemaType, schemaConfidence, mappings };
  } catch {
    console.error("[CSV Parser] Failed to parse Gemini response:", content);
    return {
      detectedSchemaType: "sales_statement",
      schemaConfidence: 0,
      mappings: headers.map((header) => ({
        sourceHeader: header,
        targetField: "unmapped",
        confidence: 0,
      })),
    };
  }
}
