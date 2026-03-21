# Implementation Plan: Budget Tracking + Manager Team Tools

**Branch**: `031-budget-track-manager-team` | **Date**: 2026-03-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/031-budget-track-manager-team/spec.md`

## Summary

Add budget tracking, late approval detection, and team spending comparison capabilities to the Manager Right-Arm persona. Budget limits are configured as optional fields on existing expense categories (stored in `businesses.customExpenseCategories`). Three new chat agent tools (`check_budget_status`, `set_budget`, `get_late_approvals`) with corresponding action cards, plus an enhanced team comparison card. Proactive budget alerts integrate with the existing Action Center system.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7 + Convex 1.31.3)
**Primary Dependencies**: LangGraph 0.4.5, Zod 3.23.8, Recharts, Radix UI, Tailwind CSS
**Storage**: Convex (businesses table for budget config, actionCenterInsights for alerts, expense_submissions for spending data)
**Testing**: Manual UAT via chat agent + build verification (`npm run build`)
**Target Platform**: Web (Vercel deployment)
**Project Type**: Web application (existing monorepo)
**Performance Goals**: Budget queries <5s, proactive alerts within 1 minute of threshold crossing
**Constraints**: Convex free plan bandwidth (2GB/month) — use actions not reactive queries for aggregations
**Scale/Scope**: ~50 businesses, ~500 users, 9+ expense categories per business

## Constitution Check

*No constitution configured — no gates to enforce.*

## Project Structure

### Documentation (this feature)

```text
specs/031-budget-track-manager-team/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
# Convex backend
convex/
├── schema.ts                          # Add budgetLimit fields to category type
├── functions/
│   ├── businesses.ts                  # Add budget CRUD mutations
│   ├── actionCenterInsights.ts        # Add budget alert creation
│   └── budgetTracking.ts              # NEW: Budget calculation queries

# Chat agent tools
src/lib/ai/tools/
├── tool-factory.ts                    # Register new tools in MANAGER_TOOLS
├── budget-status-tool.ts              # NEW: check_budget_status tool
├── set-budget-tool.ts                 # NEW: set_budget tool
└── late-approvals-tool.ts             # NEW: get_late_approvals tool

# Action cards
src/domains/chat/components/action-cards/
├── index.tsx                          # Register new cards
├── budget-status-card.tsx             # NEW: Budget vs actual per category
├── late-approvals-card.tsx            # NEW: Overdue submissions with approve button
└── team-comparison-card.tsx           # NEW: Bar chart with outlier highlighting

# Auto-generation
src/lib/ai/
└── copilotkit-adapter.ts              # Add auto-generation for new tools

# Category settings (budget field)
src/domains/expense-claims/components/
├── category-management.tsx            # Add budget column to table
└── category-form-modal.tsx            # Add optional budget limit field

# Category settings API
src/app/api/v1/expense-claims/categories/
└── route.ts                           # Handle budgetLimit in create/update
```

**Structure Decision**: All changes integrate into existing domain structure. No new directories needed. Budget logic lives in Convex functions (backend) and chat tools (agent layer). Category settings UI is extended, not replaced.
