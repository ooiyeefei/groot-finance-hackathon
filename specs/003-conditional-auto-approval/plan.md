# Implementation Plan: Conditional Auto-Approval for AR and AP Matching

**Branch**: `003-conditional-auto-approval` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-conditional-auto-approval/spec.md`

## Summary

Add a Triple-Lock auto-approval gate to AR and AP matching. When enabled, high-confidence AI matches that pass all three checks (setting ON, confidence ≥ threshold, learning depth ≥ min cycles) are auto-approved and journal entries posted immediately with "groot_ai_agent" as preparer. Includes reversal safety valve with CRITICAL_FAILURE training data capture and auto-disable after 3 failures in 30 days.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Convex + Next.js 15.5.7)
**Primary Dependencies**: Convex 1.31.3, React 19.1.2, Radix UI (Sheet, Switch, Slider)
**Storage**: Convex (new `matching_settings` table, extended `sales_orders` + `order_matching_corrections`)
**Testing**: `npm run build` (TypeScript compilation), manual UAT
**Target Platform**: Web (Next.js on Vercel)
**Project Type**: Web application
**Performance Goals**: Auto-approval decision + journal entry posting in under 5 seconds
**Constraints**: All auto-approved entries must have "groot_ai_agent" preparer audit trail; auto-disable after 3 critical failures in 30 days
**Scale/Scope**: SE Asian SME businesses, typical 20-200 orders per batch

## Constitution Check

Constitution is blank template — no gates. Following CLAUDE.md rules:
- **Double-entry bookkeeping**: Auto-approved JEs use existing `createSalesInvoiceJournalEntry` helper ✅
- **IFRS compliance**: "groot_ai_agent" preparer satisfies automated process audit requirements ✅
- **Domain-driven design**: Settings and logic live in existing `sales-invoices` domain ✅
- **Least privilege**: Settings mutation is user-facing (requires auth), reversal creates correction ✅

## Project Structure

### Source Code (repository root)

```text
# Convex backend
convex/
├── schema.ts                                        # Extended: matching_settings table
├── functions/
│   ├── matchingSettings.ts                          # NEW: CRUD for auto-approval settings
│   ├── salesOrders.ts                               # Modified: Triple-Lock gate in classifyUnmatchedOrdersWithAI
│   └── orderMatchingCorrections.ts                  # Modified: CRITICAL_FAILURE type + weight field

# Next.js frontend
src/domains/sales-invoices/
├── components/
│   ├── ar-reconciliation.tsx                        # Modified: "Verified by Groot" badge, reversal button
│   └── auto-approval-settings.tsx                   # NEW: settings drawer component
└── hooks/
    └── use-reconciliation.ts                        # Modified: settings + reversal mutation refs
```
