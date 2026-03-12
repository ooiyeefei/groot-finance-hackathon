# Research: Bank Statement Import & Auto-Reconciliation

## Decision 1: Matching Engine Location

**Decision**: Client-triggered Convex action (server-side matching logic in Convex)
**Rationale**: Matching requires querying `accounting_entries` by business, amount, date range, and reference — this is most efficient as a Convex action that runs server-side with direct DB access. The client triggers it after import or on-demand via a button.
**Alternatives considered**:
- Client-side matching (fetch all entries + match in browser) — rejected: data volume too large, security concern exposing all entries
- Background cron job — rejected: over-engineered for the initial scope; on-demand + post-import is sufficient

## Decision 2: Tab Architecture

**Decision**: Transform `AccountingEntriesClient` into a tab container with hash-routing (following `InvoicesTabContainer` pattern)
**Rationale**: The existing `InvoicesTabContainer` uses Radix Tabs + hash routing (`#records`, `#bank-recon`). This is the established pattern in the codebase. Lazy-loading sub-tab components keeps initial bundle small.
**Alternatives considered**:
- Separate route (`/accounting/bank-recon`) — rejected: violates single-page tab pattern used elsewhere
- Query params — rejected: hash routing is the established convention

## Decision 3: Duplicate Detection Strategy

**Decision**: Hash-based deduplication using (bankAccountId + transactionDate + amount + description)
**Rationale**: Bank transactions don't have globally unique IDs in CSV exports. The combination of date + amount + description is the most reliable composite key. We store a hash of this tuple and check on import.
**Alternatives considered**:
- Balance-based detection (check running balance continuity) — rejected: not all bank exports include running balance
- Exact file hash — rejected: same transactions may appear in different file extracts

## Decision 4: Confidence Scoring

**Decision**: Three-tier scoring: High (≥0.9), Medium (0.6-0.89), Low (0.3-0.59)
**Rationale**:
- High: Reference number match + amount match (near-certain)
- Medium: Amount match + date proximity ±3 days (likely correct)
- Low: Amount-only match (possible, needs confirmation)
**Alternatives considered**:
- ML-based scoring — rejected: over-engineered for MVP; deterministic rules are sufficient and transparent

## Decision 5: Split Matching

**Decision**: Deferred to post-MVP. Initial release supports 1:1 matching only.
**Rationale**: Split matching (1 bank tx → N accounting entries) adds significant UI and logic complexity. The 1:1 case covers the vast majority of transactions. Split matching can be added later without schema changes (the `reconciliation_matches` table already supports multiple entries per transaction).
**Alternatives considered**:
- Full split matching from day 1 — rejected: disproportionate complexity for edge case frequency
