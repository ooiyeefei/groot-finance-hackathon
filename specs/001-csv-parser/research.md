# Research: CSV Auto-Parser with Intelligent Column Mapping

**Branch**: `001-csv-parser` | **Date**: 2026-03-11

## Decision 1: CSV/XLSX Parsing Library

**Decision**: Use `papaparse` for CSV and `xlsx` (SheetJS) for Excel parsing — both client-side in the browser.

**Rationale**:
- `papaparse` is the de facto standard for CSV parsing in JS — handles delimiter detection, encoding, streaming, and edge cases (quoted fields, escaped characters) out of the box.
- `xlsx` (SheetJS Community Edition) handles .xlsx/.xlsm parsing and sheet enumeration. Can detect macro-enabled files by checking workbook properties.
- Both run in the browser — no server round-trip needed for header extraction and preview.
- File sizes up to 25MB are well within browser memory limits.

**Alternatives considered**:
- `csv-parse` (Node.js only — requires server-side processing)
- `d3-dsv` (lighter but lacks delimiter auto-detection and encoding handling)
- Custom parser (unnecessary — papaparse solves all edge cases)

## Decision 2: AI Column Mapping Approach

**Decision**: Use existing Qwen3-8B via Modal endpoint with a structured prompt that includes column headers, sample rows, and the target schema fields. Return JSON with mappings and confidence scores.

**Rationale**:
- Qwen3-8B is already deployed and integrated via `src/lib/ai/config/ai-config.ts`.
- OpenAI-compatible function calling format already works — define a `suggest_column_mappings` tool schema.
- Column mapping is a straightforward classification task — LLM sees "Order Total (MYR)" and maps it to `grossAmount` with high confidence.
- No need for embeddings or vector similarity — the schema has ~15 fields max, small enough for direct LLM classification.

**Alternatives considered**:
- Embedding similarity (overkill for ~15 target fields, adds Qdrant dependency)
- Rule-based keyword matching (brittle, fails on creative column names like "Amt (incl GST)")
- Gemini 3.1 Flash-Lite (viable alternative but Qwen is already warm and integrated)

## Decision 3: Template Fingerprinting Strategy

**Decision**: Sort column headers alphabetically, lowercase, join with `|` separator, then SHA-256 hash. Store hash as the fingerprint field on the template.

**Rationale**:
- Order-independent: CSV exports from the same platform may reorder columns between versions.
- Case-insensitive: "Order ID" and "order id" should match the same template.
- Deterministic: Same set of headers always produces the same hash.
- Compact: SHA-256 hash is 64 chars regardless of header count.

**Alternatives considered**:
- Exact string match (fails on column reordering)
- Fuzzy hashing (out of scope per spec — exact match only for v1)
- Header count + first/last header (too many collisions)

## Decision 4: Formula Injection Sanitization

**Decision**: Before processing any cell value, check if it starts with `=`, `+`, `-`, or `@`. If so, prepend a single quote `'` to neutralize formula execution. Reject .xlsm files entirely.

**Rationale**:
- Standard OWASP recommendation for CSV injection prevention.
- The single quote prefix is invisible when the data is consumed programmatically (it's only meaningful in spreadsheet apps).
- .xlsm rejection is straightforward — check file extension before parsing.

**Alternatives considered**:
- Strip the prefix character entirely (loses data — a negative number starting with `-` would be corrupted)
- Allow formulas through (security risk)

## Decision 5: Domain Structure

**Decision**: Create new domain `src/domains/csv-parser/` following existing domain patterns (components/, hooks/, lib/, types/).

**Rationale**:
- Follows established codebase convention — every feature domain has its own directory.
- Separate from `exports/` because import ≠ export — different data flow direction, different entities, different UI.
- The parser is a reusable component invoked by consuming features (AR Reconciliation, bank import).

**Alternatives considered**:
- Add to existing `exports/` domain (conflates import with export, violates single responsibility)
- Add to `utilities/` (too generic — this is a first-class feature domain)

## Decision 6: Convex Table Design

**Decision**: One new table: `csv_import_templates`. No table for parsed results (transient, in-memory only per spec clarification).

**Rationale**:
- Templates are the only persistent entity — they store confirmed mappings + fingerprint for reuse.
- Parsed results are consumed by downstream features immediately — no need to persist intermediate state.
- Import sessions are in-memory only (one-shot flow per clarification).
- The `csv_import_templates` table mirrors the `export_templates` pattern but for the reverse direction.

**Alternatives considered**:
- `csv_parsed_results` table (spec says parser-only, no persistence of parsed data)
- Reuse `export_templates` table (different purpose, different fields — would be confusing)

## Decision 7: Embedded Component Architecture

**Decision**: Build the CSV parser as a React component (`<CsvImportModal>`) that consuming features render inside their own pages. Pass callbacks for `onComplete` and `onCancel`.

**Rationale**:
- Per spec clarification: embedded component, not standalone page.
- Modal/drawer pattern is already used across the app (Sheet component from `src/components/ui/sheet.tsx`).
- Consuming features control when to show the import modal and what to do with the results.
- Clean interface: `<CsvImportModal schemaType="sales" onComplete={(data) => ...} />`

**Alternatives considered**:
- Full page with routing (contradicts spec — no standalone navigation)
- Context provider pattern (over-engineered for a modal-based flow)
