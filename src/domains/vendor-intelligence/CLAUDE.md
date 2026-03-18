# Vendor Intelligence Domain

**Feature**: Smart Vendor Intelligence (#320)
**Status**: Implemented (Phase 1-7)

## Architecture

### Two-Tier Intelligence
- **Tier 1 (Rule-based)**: Fixed thresholds (>10% per-invoice, >20% trailing 6-month avg). Runs inline during invoice processing in `recordPriceObservationsBatch`. Free, instant, handles 60-80% of cases.
- **Tier 2 (DSPy adaptive)**: Cross-vendor item matching via Lambda. 5 DSPy components: Signature (MatchVendorItems), Module (VendorItemMatcher), ChainOfThought (semantic reasoning), Assert (different vendors + compatible specs), BootstrapFewShot (inline when ≥20 corrections). MIPROv2 optimization on-demand. Auto-suggest triggers on Jaccard 40-79% items after invoice processing.

### Data Flow
```
Invoice Processed → recordPriceObservationsBatch
  ├─ Generate itemIdentifier (item code OR description hash)
  ├─ Insert vendor_price_history record
  ├─ Anomaly Detection (Tier 1):
  │   ├─ Per-invoice: >10% from last → vendor_price_anomalies (standard/high-impact)
  │   ├─ Trailing avg: >20% over 6mo → vendor_price_anomalies (high-impact)
  │   └─ New item: first observation → vendor_price_anomalies (standard)
  ├─ If high-impact → scheduler.runAfter → vendorRecommendedActions.generate
  └─ If Jaccard 40-79% → scheduler.runAfter → _autoSuggestTrigger (DSPy Tier 2)
      └─ Lambda match_vendor_items → if confidence ≥80% → _createFromAutoSuggest
```

### DSPy Tier 2 Learning Loop
```
User confirms/rejects match → recordCorrection mutation
  ├─ Insert vendor_item_matching_corrections (normalizedPairKey dedup)
  ├─ If confirmed → cross_vendor_item_groups.matchSource = "user-confirmed"
  └─ If rejected → delete ai-suggested group + block re-suggestion

Corrections accumulate → ≥20 corrections + ≥10 unique pairs
  → triggerOptimization action → Lambda optimize_vendor_item_model
  → MIPROv2 trains → accuracy gating (must beat current model)
  → If accepted → save to S3, activate in dspy_model_versions
  → Next suggestMatches call loads optimized model (uncapped confidence)
```

### Bandwidth Rules (CRITICAL)
Per CLAUDE.md Convex Bandwidth rules:
- **NO cron jobs** for scorecard/risk calculations — use on-demand `action` + `internalQuery` pattern
- `vendorScorecards.refreshIfStale`: Recalculates only if >24h stale
- `vendorRiskProfiles.refreshIfStale`: Recalculates only if >7 days stale
- All queries use `.take(N)` or tight index filters — never unbounded `.collect()`
- Anomaly detection uses `.take(20)` for historical comparison

## Tables
| Table | Purpose |
|-------|---------|
| `vendor_price_history` | Extended existing table with #320 fields (itemIdentifier, archivedFlag, matchConfidenceScore, etc.) |
| `vendor_price_anomalies` | Detected price anomalies and billing pattern changes |
| `vendor_scorecards` | Pre-calculated 6-metric vendor performance scorecards |
| `vendor_risk_profiles` | 4-dimension risk scores (payment, concentration, compliance, price) |
| `cross_vendor_item_groups` | Groups equivalent items across vendors for price comparison |
| `vendor_recommended_actions` | AI-suggested actions for high-impact anomalies |
| `vendor_item_matching_corrections` | DSPy training data: user confirmations/rejections of cross-vendor matches |

## Convex Functions
| File | Functions |
|------|-----------|
| `vendorPriceHistory.ts` | createFromInvoiceLineItem, listPriceHistory, getItemVendorTimeline, getPriceTrendData, confirmFuzzyMatch + existing functions |
| `vendorPriceAnomalies.ts` | detectAnomalies, listAlerts, dismissAlert |
| `vendorScorecards.ts` | calculate, get, list, refreshIfStale |
| `vendorRiskProfiles.ts` | calculate, get, list, refreshIfStale |
| `crossVendorItemGroups.ts` | createGroup, updateGroup, deleteGroup, list, getGroupById, _createFromAutoSuggest |
| `vendorRecommendedActions.ts` | generate, list, updateStatus |
| `vendorItemMatching.ts` | suggestMatches, _autoSuggestTrigger, recordCorrection, triggerOptimization, _getItemsForMatching, _getRejectedPairKeys, _getActiveModel, _getCorrections, _checkOptimizationReadiness, _recordTrainingResult |
| `vendorIntelligenceMCP.ts` | analyzeVendorPricing (MCP tool query for chat agent) |

## UI Pages
| Route | Component |
|-------|-----------|
| `/vendor-intelligence/alerts` | AlertsClient — anomaly alert list with filters |
| `/vendor-intelligence/price-intelligence` | PriceIntelligenceClient — Recharts charts + cross-vendor groups |
| `/vendor-intelligence/vendor/[vendorId]` | VendorDetailClient — scorecard + risk profile + alerts |

## Hooks
All hooks use `useQuery` for real-time Convex subscriptions:
- `use-price-history.ts` — Price history with filters + pagination
- `use-anomaly-alerts.ts` — Alerts with dismiss mutation
- `use-vendor-scorecard.ts` — Single vendor scorecard
- `use-vendor-risk-profile.ts` — Single vendor risk profile
- `use-cross-vendor-groups.ts` — CRUD for item groups
- `use-recommended-actions.ts` — Action list with complete/dismiss mutations
