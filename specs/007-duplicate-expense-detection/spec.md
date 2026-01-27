# Feature Specification: Duplicate Expense Claim Detection

**Feature Branch**: `007-duplicate-expense-detection`
**Created**: 2026-01-25
**Status**: Draft
**Input**: User description: "Auto detect and flag duplicated expense claims by receipt ID, date-time, amount, and merchant/vendor with pragmatic engineering approach"

## Clarifications

### Session 2026-01-25

- Q: Should duplicate detection match against ALL existing claims regardless of status, or exclude certain statuses? → A: Exclude rejected claims from duplicate matching (allow re-submission of rejected receipts)
- Q: Should duplicate detection flag when different users in the same business submit identical receipts? → A: Yes, flag cross-user duplicates with "potential shared expense" warning; provide checkbox for user to acknowledge split expense
- Q: At what point should the duplicate warning appear to the user? → A: After user fills in expense details but before clicking "Submit" (pre-submission validation stage, not after manager review)
- Q: Should this feature include a rejected claim re-submission flow? → A: Yes, add "Correct & Resubmit" button on rejected claims that creates a new draft pre-filled with original data

## Executive Summary

SMEs need protection against accidental double-submission of expense claims. The attached example shows the problem: two expense claims with identical receipt IDs (REP-A001014/2025) and matching amounts (160.00) are not flagged as duplicates. Similarly, two Gamma Plus subscription entries with the same reference (O853Y7WM-0001) exist without warnings.

### Recommended Approach: Rule-Based Detection with Optional LLM Enhancement

After analyzing the codebase and engineering trade-offs:

**Primary Recommendation: Rule-Based Detection (Phase 1)**
- Fast (< 100ms), deterministic, zero additional cost
- Covers 95%+ of duplicates through exact/fuzzy field matching
- Already partially implemented - extends existing 4-field match

**Optional Enhancement: LLM Validation (Phase 2 - Future)**
- Add during extraction to catch edge cases (receipt variants, reformatted numbers)
- Only for medium/low confidence extractions where rule-based is uncertain

**Why Not LLM-First?**
1. **Cost**: Every extraction already uses Gemini; adding dedup check = 2x API calls
2. **Latency**: LLM calls add 2-4s; rule-based is instant
3. **Determinism**: Rule-based gives consistent results; LLM may vary
4. **Current coverage gap**: The existing rule-based logic requires `reference_number` to be present - many receipts don't have one

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prevent Accidental Re-submission (Priority: P1)

An employee uploads a receipt they've already submitted. The system immediately warns them before creating a duplicate claim, showing which existing claim matches.

**Why this priority**: Core value proposition - prevents the most common duplicate scenario without any workflow disruption.

**Independent Test**: Upload the same receipt twice within 5 minutes. Second upload shows duplicate warning with link to original claim.

**Acceptance Scenarios**:

1. **Given** a claim exists with reference REP-A001014/2025 for user X, **When** user X uploads a receipt with reference REP-A001014/2025, **Then** the system displays a duplicate warning with the existing claim details before creation
2. **Given** a claim exists with (date: 2025-11-30, amount: 160.00, vendor: "Klinik Pergigian Wonder Tooth"), **When** user uploads receipt matching those 3 fields, **Then** system flags as potential duplicate even without matching reference number
3. **Given** a duplicate is detected, **When** user reviews the warning, **Then** they can either cancel submission or override with justification

---

### User Story 2 - Visual Duplicate Indicators in List View (Priority: P2)

Managers reviewing expense claims can see visual indicators highlighting potential duplicates within the claims list.

**Why this priority**: Enables managers to catch duplicates during approval workflow, serving as a second line of defense.

**Independent Test**: Create two claims with matching vendor + date + amount. View expense claims list - both should show a "Potential Duplicate" badge.

**Acceptance Scenarios**:

1. **Given** multiple claims with matching key fields exist, **When** manager views expense claims list, **Then** duplicate groups are visually highlighted with a badge/icon
2. **Given** a claim is flagged as duplicate, **When** manager clicks the duplicate indicator, **Then** they see a comparison view of potentially duplicate claims
3. **Given** the manager confirms claims are NOT duplicates (legitimate separate expenses), **When** they mark as "Reviewed - Not Duplicate", **Then** the flag is dismissed and not shown again

---

### User Story 3 - Batch Duplicate Detection Report (Priority: P3)

Finance administrators can run a report identifying all potential duplicates across a date range to audit historical data.

**Why this priority**: Addresses existing duplicate data and provides ongoing audit capability.

**Independent Test**: With 5 known duplicate pairs in test data, run duplicate report - all 5 pairs appear with match confidence scores.

**Acceptance Scenarios**:

1. **Given** admin selects date range and runs duplicate report, **When** report completes, **Then** all potential duplicate pairs are listed with match confidence
2. **Given** report shows duplicate pairs, **When** admin bulk-marks selected pairs as "Reviewed", **Then** status is updated for future reports

---

### Edge Cases

- What happens when two different users submit the same receipt (shared expense)? Flag with "Potential Shared Expense" warning; user must check "This is a split expense" acknowledgment to proceed
- How does system handle receipts with no reference number? Fall back to vendor + date + amount matching
- What happens when amounts differ due to currency conversion rounding? Use tolerance (±1% or ±1 unit of currency)
- How does system handle vendor name variations ("ABC Restaurant" vs "ABC Rest.")? Fuzzy matching with normalized names
- What happens when same vendor, same date, different amounts? Not flagged (legitimate separate transactions)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect duplicates using a multi-tier matching strategy:
  - Tier 1 (Exact): Receipt/reference number match (highest confidence)
  - Tier 2 (Strong): Vendor + Date + Amount match (high confidence)
  - Tier 3 (Fuzzy): Normalized vendor + Date ±1 day + Amount ±1% (medium confidence)

- **FR-002**: System MUST check for duplicates at pre-submission validation (after user fills in expense details, before clicking "Submit") - warning appears to the submitting user, not the manager

- **FR-003**: System MUST display clear duplicate warnings showing:
  - The existing claim(s) that match
  - Which fields matched (reference, vendor, date, amount)
  - Confidence level (exact, strong, possible)
  - Link to view the existing claim

- **FR-004**: System MUST allow users to override duplicate detection with a justification reason (e.g., "Separate transactions at same vendor")

- **FR-005**: System MUST scope duplicate detection to the same business, checking claims from both the same user AND other users within the business (excluding rejected claims)

- **FR-005a**: For same-user duplicates, system MUST display standard duplicate warning with override option

- **FR-005b**: For cross-user duplicates (different user, same business), system MUST display "Potential Shared Expense" warning with a checkbox for user to acknowledge: "This is a split expense - I am claiming my portion"

- **FR-006**: System MUST show visual duplicate indicators (badge/icon) on expense claim list items when potential duplicates exist

- **FR-007**: System MUST support dismissing false-positive duplicate flags via "Not a Duplicate" action

- **FR-008**: System MUST log all duplicate detection events and override decisions for audit purposes

- **FR-009**: System MUST normalize vendor names before comparison (trim whitespace, lowercase, remove common suffixes like "Sdn Bhd", "Pte Ltd")

- **FR-010**: System MUST handle multi-currency comparison by converting amounts to home currency before comparison

- **FR-011**: System MUST provide a "Correct & Resubmit" action on rejected expense claims that:
  - Creates a new draft claim pre-filled with the original claim's data (vendor, amount, date, category, description)
  - Allows user to upload a replacement receipt or keep the original
  - Links the new claim to the rejected claim for audit trail
  - The rejected claim remains in rejected status (not deleted)

### Key Entities

- **DuplicateMatch**: Represents a potential duplicate relationship between two expense claims
  - Source claim reference
  - Matched claim reference
  - Match tier (exact, strong, fuzzy)
  - Match fields (which fields triggered the match)
  - Confidence score (0.0-1.0)
  - Status (pending, confirmed_duplicate, dismissed)
  - Override reason (if user dismissed)
  - Detected timestamp

- **ExpenseClaim** (enhanced): Existing entity with new attributes
  - `duplicateStatus`: none | potential | confirmed | dismissed
  - `duplicateGroupId`: Links claims identified as duplicates of each other
  - `resubmittedFromId`: Reference to rejected claim this was created from (for "Correct & Resubmit" flow)
  - `resubmittedToId`: Reference to new claim created from this rejected claim

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of exact duplicate submissions (same receipt ID) are caught before claim creation
- **SC-002**: 80% of likely duplicates (same vendor + date + amount) are flagged for user review
- **SC-003**: Duplicate detection check completes within 500ms (p95) to avoid disrupting upload flow
- **SC-004**: False positive rate stays below 10% (measured by user dismissals marked "Not a Duplicate")
- **SC-005**: Users can complete duplicate review and override within 30 seconds
- **SC-006**: Zero additional cost per claim (rule-based, no LLM calls for detection)

## Technical Approach Rationale

### Why Rule-Based First (Pragmatic Engineering Choice)

| Criterion       | Rule-Based          | LLM-Based              |
|-----------------|---------------------|------------------------|
| **Latency**     | < 100ms             | 2-4s per call          |
| **Cost**        | $0 (database query) | $0.001-0.01 per check  |
| **Consistency** | 100% deterministic  | Variable outputs       |
| **Debuggability** | Transparent logic | Black box              |
| **Maintenance** | Simple rules        | Prompt engineering     |
| **Coverage**    | ~95% of real duplicates | ~99% with edge cases |

**The 95% coverage is sufficient** because:
1. Users can override edge cases
2. Managers provide second-line review
3. Audit reports catch historical issues
4. The 5% edge cases typically involve receipts with no identifiable markers

### When LLM Enhancement Makes Sense (Future Phase)

Consider LLM integration only if:
- Rule-based false negative rate exceeds 10%
- Users frequently override "not detected" cases
- Receipts commonly lack reference numbers AND vendor names

Integration point would be in the Lambda extraction service, asking Gemini: "Have you seen a similar receipt for this user recently?" - but this adds complexity and cost that isn't justified for initial implementation.

## Assumptions

1. Receipt reference numbers, when present, are unique identifiers
2. Same vendor + date + amount within same user's claims is rare for legitimate separate expenses
3. Currency conversion rounding can cause ±1% amount differences
4. Vendor names may have minor variations that fuzzy matching should catch
5. Most duplicates occur within a 30-day window (optimize query for recent claims first)
6. Duplicate detection is scoped per business - cross-business duplicates are not relevant
