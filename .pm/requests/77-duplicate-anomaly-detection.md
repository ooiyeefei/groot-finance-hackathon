# Issue #77: Duplicate & Anomaly Detection

**GitHub URL:** https://github.com/grootdev-ai/finanseal-mvp/issues/77
**Priority:** P2 - AI Differentiation
**WINNING Score:** 42/60
**Created:** 2025-12-27

## Summary
Add AI-powered duplicate receipt detection and spending anomaly alerts. **AI Differentiation** - extends FinanSEAL's AI value proposition beyond OCR.

## Scope

### Duplicate Receipt Detection
- [ ] Same vendor + similar amount + same date detection
- [ ] Fuzzy matching for vendor name variations
- [ ] Image hash comparison for identical receipts
- [ ] Warning UI in expense submission flow
- [ ] Admin dashboard for duplicate review

### Anomaly Detection
- [ ] Unusual amount alerts (vs category average)
- [ ] Category anomaly detection (unexpected categories)
- [ ] Suspicious pattern flagging (round numbers, sequential dates)
- [ ] Vendor frequency anomalies

### Notification System
- [ ] In-app alerts for detected anomalies
- [ ] Email digest for managers
- [ ] Severity levels (info, warning, critical)

## WINNING Analysis

| Factor | Score | Rationale |
|--------|-------|-----------|
| Worth | 7/10 | Prevents overspending |
| Impact | 6/10 | Value-add feature |
| Now | 6/10 | Competitors have it |
| Necessary | 7/10 | Extends AI value prop |
| Implementable | 7/10 | AI enhancement |
| Notable | 7/10 | AI moat builder |

## Competitor Evidence
| Competitor | Duplicate Detection | Anomaly Detection |
|------------|--------------------|--------------------|
| Ramp | ✅ "Spending error detection" | ✅ |
| Brex | ✅ | ✅ |
| Zoho | ❌ | ✅ Zia AI |
| Xero | ❌ | ❌ |
| QuickBooks | ❌ | ❌ |

**This positions FinanSEAL alongside Ramp/Brex for AI capabilities while maintaining SEA focus.**

## Technical Approach
- Leverage existing OCR extraction data
- Similarity scoring with configurable thresholds
- Background job for batch analysis
- Real-time check during submission
