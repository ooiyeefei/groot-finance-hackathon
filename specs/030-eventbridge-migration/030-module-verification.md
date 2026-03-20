# Lambda Module Verification Report

**Date**: 2026-03-20
**Task**: Verify all 10 Lambda modules match original Convex cron logic

---

## Summary

| Status | Count | Details |
|--------|-------|---------|
| ✅ Match | 7 | Correct function paths and args |
| 🔧 Fixed | 2 | Fixed incorrect function paths |
| 🚧 Deferred | 2 | Commented out - Convex functions to be created (US3) |

---

## Module-by-Module Analysis

### 1. proactive-analysis.ts
- **Lambda Module**: `modules/proactive-analysis.ts`
- **Convex Function**: `functions/actionCenterJobs:runProactiveAnalysis`
- **Status**: ✅ **MATCH**
- **Cron Schedule**: Daily 6:30 AM UTC
- **Arguments**: `{}` (empty object)
- **Notes**: Identical. Function exists and is an `internalAction`.

---

### 2. ai-discovery.ts
- **Lambda Module**: `modules/ai-discovery.ts`
- **Convex Function**: `functions/actionCenterJobs:runAIDiscovery`
- **Status**: ✅ **MATCH**
- **Cron Schedule**: Daily 7:00 AM UTC
- **Arguments**: `{}` (empty object)
- **Notes**: Identical. Function exists and is an `internalAction`.

---

### 3. notification-digest.ts
- **Lambda Module**: `modules/notification-digest.ts`
- **Convex Function**: `functions/notificationJobs:runDigest`
- **Status**: ✅ **MATCH**
- **Cron Schedule**: Daily 8:00 AM UTC
- **Arguments**: `{}` (empty object)
- **Notes**: Identical. Function exists but is an `internalMutation` (not `internalAction`). This is acceptable — the HTTP API can invoke both mutations and actions.

---

### 4. einvoice-monitoring.ts
- **Lambda Module**: `modules/einvoice-monitoring.ts`
- **Convex Function**: `functions/einvoiceMonitoring:runMonitoringCycle`
- **Status**: ✅ **MATCH**
- **Cron Schedule**: Daily 8:30 AM UTC
- **Arguments**: `{}` (empty object)
- **Notes**: Identical. Function exists and is an `internalAction`.

---

### 5. ai-daily-digest.ts
- **Lambda Module**: `modules/ai-daily-digest.ts`
- **Convex Function**: `functions/aiDigest:dailyDigest`
- **Status**: 🔧 **FIXED**
- **Cron Schedule**: Was disabled (hourly), now re-enabled via EventBridge
- **Arguments**: `{}` (empty object)
- **Notes**:
  - ~~The Lambda module was calling `functions/actionCenterJobs:runAIDailyDigest` which did not exist.~~
  - **Fixed**: Updated to call `functions/aiDigest:dailyDigest` (line 421 of `aiDigest.ts`).
  - Function returns void, updated Lambda module to handle this correctly.
  - The cron was disabled at line 384 of `crons.ts` due to bandwidth concerns.

---

### 6. dspy-optimization.ts
- **Lambda Module**: `modules/dspy-optimization.ts`
- **Convex Functions**:
  - `dspy-fee` → `functions/dspyOptimization:weeklyOptimization`
  - `dspy-bank-recon` → `functions/bankReconOptimization:weeklyOptimization`
  - `dspy-po-match` → `functions/poMatchOptimization:weeklyOptimization`
  - `dspy-ar-match` → `functions/orderMatchingOptimization:weeklyOptimization`
- **Status**: ✅ **MATCH**
- **Cron Schedule**: Weekly Sunday 2:00-5:00 AM UTC (staggered)
- **Arguments**: `{ force: false }`
- **Notes**: All four DSPy optimization functions exist and are `internalAction`. Correct.

---

### 7. einvoice-dspy-digest.ts
- **Lambda Module**: `modules/einvoice-dspy-digest.ts`
- **Convex Function**: `functions/einvoiceDspyDigest:sendWeeklyDigest`
- **Status**: 🔧 **FIXED**
- **Cron Schedule**: Was commented out in crons.ts (line 238-242)
- **Arguments**: `{}` (empty object)
- **Notes**:
  - ~~The Lambda module was calling `functions/einvoiceDspyJobs:runWeeklyDigest` which did not exist.~~
  - **Fixed**: Updated to call `functions/einvoiceDspyDigest:sendWeeklyDigest` (line 19 of `einvoiceDspyDigest.ts`).
  - Function returns void, updated Lambda module to handle this correctly.

---

### 8. chat-agent-optimization.ts
- **Lambda Module**: `modules/chat-agent-optimization.ts`
- **Convex Function**: `functions/chatOptimizationNew:weeklyOptimization`
- **Status**: ✅ **MATCH**
- **Cron Schedule**: Not in current crons.ts (new migration)
- **Arguments**: `{ force: false }`
- **Notes**: Function exists at line 156 of `chatOptimizationNew.ts` and is an `internalAction`. Correct.

---

### 9. weekly-email-digest.ts
- **Lambda Module**: `modules/weekly-email-digest.ts`
- **Convex Function**: `functions/emailDigestJobs:runWeeklyDigest`
- **Status**: 🚧 **DEFERRED (US3)**
- **Cron Schedule**: Not in current crons.ts (planned feature)
- **Expected Function**: To be created in `convex/functions/emailDigestJobs.ts`
- **Notes**:
  - This is a planned feature from User Story 3 (see spec.md).
  - The Lambda module and handler imports have been commented out.
  - Convex function must be created before uncommenting.
  - See tasks.md T034, T037 for implementation tasks.

---

### 10. scheduled-reports.ts
- **Lambda Module**: `modules/scheduled-reports.ts`
- **Convex Function**: `functions/scheduledReportJobs:runScheduledReports`
- **Status**: 🚧 **DEFERRED (US3)**
- **Cron Schedule**: Not in current crons.ts (planned feature)
- **Expected Function**: To be created in `convex/functions/scheduledReportJobs.ts`
- **Notes**:
  - This is a planned feature from User Story 3 (see spec.md).
  - The Lambda module and handler imports have been commented out.
  - Convex function must be created before uncommenting.
  - See tasks.md T035, T038 for implementation tasks.

---

## Fixes Applied

### ✅ Fixed (Wrong Function Paths)

1. **ai-daily-digest.ts**
   - ~~**Was**: `functions/actionCenterJobs:runAIDailyDigest`~~
   - **Now**: `functions/aiDigest:dailyDigest`
   - **Additional**: Updated return type handling (function returns void)

2. **einvoice-dspy-digest.ts**
   - ~~**Was**: `functions/einvoiceDspyJobs:runWeeklyDigest`~~
   - **Now**: `functions/einvoiceDspyDigest:sendWeeklyDigest`
   - **Additional**: Updated return type handling (function returns void)

### 🚧 Deferred (Planned Features - US3)

3. **weekly-email-digest.ts**
   - **Status**: Commented out in `index.ts` handler and imports
   - **Action Required**: Create `convex/functions/emailDigestJobs.ts:runWeeklyDigest` before uncommenting
   - **Related Tasks**: T034 (module), T037 (EventBridge rule)

4. **scheduled-reports.ts**
   - **Status**: Commented out in `index.ts` handler and imports
   - **Action Required**: Create `convex/functions/scheduledReportJobs.ts:runScheduledReports` before uncommenting
   - **Related Tasks**: T035 (module), T038 (EventBridge rule)

---

## Verification Status by Category

### Existing Convex Crons (Should Match Exactly)
- ✅ proactive-analysis
- ✅ ai-discovery
- ✅ notification-digest
- ✅ einvoice-monitoring
- 🔧 ai-daily-digest (fixed - was wrong path)
- ✅ dspy-fee, dspy-bank-recon, dspy-po-match, dspy-ar-match
- 🔧 einvoice-dspy-digest (fixed - was wrong path)

### New EventBridge Jobs (Not in Current Crons)
- ✅ chat-agent-optimization
- 🚧 weekly-email-digest (deferred - US3)
- 🚧 scheduled-reports (deferred - US3)

---

## Conclusion

**All 10 modules verified and addressed:**

1. ✅ **7 modules** matched perfectly from the start
2. 🔧 **2 modules** (ai-daily-digest, einvoice-dspy-digest) had incorrect paths → **FIXED**
3. 🚧 **2 modules** (weekly-email-digest, scheduled-reports) are planned features (US3) → **COMMENTED OUT**

**Ready for deployment:**
- 8 modules are active and correctly wired: proactive-analysis, ai-discovery, notification-digest, einvoice-monitoring, ai-daily-digest, dspy-optimization (4 variants), einvoice-dspy-digest, chat-agent-optimization
- 2 modules are commented out pending Convex function creation (US3): weekly-email-digest, scheduled-reports

**Next steps:**
1. Deploy the Lambda with 8 active modules
2. Create EventBridge rules for the 8 active modules
3. Test each module with manual invocation
4. Later: Implement US3 Convex functions, uncomment modules, add EventBridge rules
