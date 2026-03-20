# Convex Cron Business Logic Extraction

**Document Purpose**: Map each Convex cron job scheduled for EventBridge migration to its implementation requirements.

**Context**: Issue #353 — Migrate heavy Convex crons to EventBridge → Lambda → Convex HTTP API to reduce Convex bandwidth consumption by 94%.

---

## Migration Overview

All crons below currently run INSIDE Convex, causing every table read to count toward the 2 GB/month bandwidth limit. The migration pattern:

1. **EventBridge schedule** → triggers Lambda on AWS
2. **Lambda** → calls Convex HTTP API with `internal.functions.*` endpoint
3. **Lambda processes data locally** → only writes final result back to Convex
4. **Bandwidth saved**: 94% reduction (from ~2 GB/month to ~150 MB/month)

---

## 1. DSPy Fee Classification Optimization

**Current Cron**: `dspy-fee-optimization` (weekly, Sundays at 2 AM UTC)
**Convex Function**: `convex/functions/dspyOptimization.ts::weeklyOptimization`

### Function Signature
```typescript
internalAction weeklyOptimization(args: { force?: boolean })
```

### Tables Read

| Table | Query Pattern | Index Used | Purpose |
|-------|---------------|------------|---------|
| `fee_classification_corrections` | `.collect()` (full scan) | None | Get all corrections for all platforms |
| `dspy_model_versions` | `.withIndex("by_platform_status", q => q.eq("platform", platform).eq("status", "active"))` | `by_platform_status` | Get current active model per platform |

### Business Logic Flow

1. **Query all corrections** from `fee_classification_corrections` table
2. **Group by platform** (e.g., "grabpay", "tng_ewallet", "boost")
3. **For each platform, check safeguards**:
   - Minimum volume: ≥100 corrections
   - Minimum diversity: ≥10 unique fee names
   - New data: has corrections after `lastCorrectionId` of active model
4. **For platforms passing safeguards**:
   - Get all corrections for that platform
   - Get current active model S3 key (if exists)
   - Call MCP tool `optimize_model` with corrections + current model
   - If optimization improved accuracy:
     - Record new model in `dspy_model_versions` table
     - Update active model's `lastCorrectionId` to mark corrections consumed

### Tables Written

| Table | Operation | When |
|-------|-----------|------|
| `dspy_model_versions` | Insert new record | After successful optimization |
| `dspy_model_versions` | Patch `lastCorrectionId` | After recording new model |

### External API Calls

- **MCP Lambda** (`finanseal-mcp-server`):
  - Tool: `optimize_model`
  - Args: `{ platform, corrections, currentModelS3Key, optimizerType: "miprov2" }`
  - Returns: `{ success, newModelS3Key, beforeAccuracy, afterAccuracy, trainingExamples, testSetSize }`

### Dependencies

- `internal.functions.dspyOptimization.getPlatformsReadyForOptimization` (query)
- `internal.functions.dspyOptimization.getAllCorrectionsForPlatform` (query)
- `internal.functions.dspyModelVersions.getActiveModel` (query)
- `internal.functions.dspyModelVersions.recordTrainingResult` (mutation)
- `internal.functions.dspyOptimization.markOptimizationConsumed` (mutation)
- `callMCPTool()` from `convex/lib/mcpClient.ts`

### Lambda Implementation Requirements

```typescript
// EventBridge → Lambda handler
export async function handler(event: EventBridgeEvent) {
  // 1. Query Convex HTTP API: getPlatformsReadyForOptimization
  const platforms = await convexQuery("functions/dspyOptimization:getPlatformsReadyForOptimization", { force: false });

  for (const platform of platforms) {
    // 2. Query corrections for this platform
    const corrections = await convexQuery("functions/dspyOptimization:getAllCorrectionsForPlatform", { platform: platform.platform });

    // 3. Get active model
    const activeModel = await convexQuery("functions/dspyModelVersions:getActiveModel", { platform: platform.platform });

    // 4. Call MCP optimize_model (Lambda → Lambda, no Convex bandwidth)
    const result = await callMCPTool("optimize_model", {
      platform: platform.platform,
      corrections,
      currentModelS3Key: activeModel?.s3Key ?? null,
      optimizerType: "miprov2"
    });

    // 5. If success, write result back to Convex
    if (result.success && result.newModelS3Key) {
      await convexMutation("functions/dspyModelVersions:recordTrainingResult", {
        platform: platform.platform,
        s3Key: result.newModelS3Key,
        accuracy: result.afterAccuracy,
        trainingExamples: result.trainingExamples,
        optimizerType: "miprov2",
        beforeAccuracy: result.beforeAccuracy
      });

      await convexMutation("functions/dspyOptimization:markOptimizationConsumed", {
        platform: platform.platform,
        lastCorrectionId: platform.latestCorrectionId
      });
    }
  }
}
```

---

## 2. Bank Recon DSPy Optimization

**Current Cron**: `bank-recon-optimization` (weekly, Sundays at 3 AM UTC)
**Convex Function**: `convex/functions/bankReconOptimization.ts::weeklyOptimization`

### Function Signature
```typescript
internalAction weeklyOptimization(args: { force?: boolean })
```

### Tables Read

| Table | Query Pattern | Index Used | Purpose |
|-------|---------------|------------|---------|
| `bank_recon_corrections` | `.collect()` (full scan) | None | Get all corrections for all businesses |
| `dspy_model_versions` | `.withIndex("by_platform_status", q => q.eq("platform", `bank_recon_${businessId}`).eq("status", "active"))` | `by_platform_status` | Get active model per business |

### Business Logic Flow

1. **Query all corrections** from `bank_recon_corrections` table
2. **Group by businessId**
3. **For each business, check safeguards**:
   - Minimum volume: ≥20 corrections
   - Minimum diversity: ≥10 unique transaction descriptions
   - New data: has corrections after `lastCorrectionId` of active model
4. **For businesses passing safeguards**:
   - Get all corrections for that business
   - Get current active model (platform key: `bank_recon_${businessId}`)
   - Call MCP tool `optimize_bank_recon_model` with corrections + current model
   - If optimization improved:
     - Record new model in `dspy_model_versions`
     - Update `lastCorrectionId` to mark corrections consumed

### Tables Written

| Table | Operation | When |
|-------|-----------|------|
| `dspy_model_versions` | Insert new record | After successful optimization |
| `dspy_model_versions` | Patch `lastCorrectionId` | After recording new model |

### External API Calls

- **MCP Lambda**:
  - Tool: `optimize_bank_recon_model`
  - Args: `{ corrections, currentModelS3Key, optimizerType: "miprov2" }`
  - Returns: `{ success, newModelS3Key, beforeAccuracy, afterAccuracy, trainingExamples, testSetSize }`

### Dependencies

- `internal.functions.bankReconOptimization.getBusinessesReadyForOptimization` (query)
- `internal.functions.bankReconOptimization.getAllCorrectionsForBusiness` (query)
- `internal.functions.bankReconOptimization.getLatestModel` (query)
- `internal.functions.dspyModelVersions.recordTrainingResult` (mutation)
- `internal.functions.bankReconOptimization.markOptimizationConsumed` (mutation)
- `callMCPTool()` from `convex/lib/mcpClient.ts`

---

## 3. PO Match DSPy Optimization

**Current Cron**: `po-match-optimization` (weekly, Sundays at 4 AM UTC)
**Convex Function**: `convex/functions/poMatchOptimization.ts::weeklyOptimization`

### Function Signature
```typescript
internalAction weeklyOptimization(args: { force?: boolean })
```

### Tables Read

| Table | Query Pattern | Index Used | Purpose |
|-------|---------------|------------|---------|
| `po_match_corrections` | `.collect()` (full scan) | None | Get all corrections for all businesses |
| `dspy_model_versions` | `.withIndex("by_platform_status", q => q.eq("platform", `po_matching_${businessId}`).eq("status", "active"))` | `by_platform_status` | Get active model per business |

### Business Logic Flow

**Identical to Bank Recon Optimization**, except:
- Correction table: `po_match_corrections`
- Platform key: `po_matching_${businessId}`
- MCP tool: `optimize_po_matching_model`
- Diversity metric: unique PO line descriptions + invoice line descriptions (combined)

### Safeguards
- Minimum volume: ≥20 corrections
- Minimum diversity: ≥10 unique item descriptions
- New data: corrections after `lastCorrectionId`

### External API Calls

- **MCP Lambda**:
  - Tool: `optimize_po_matching_model`
  - Args: `{ corrections, currentModelS3Key, optimizerType: "miprov2" }`

---

## 4. AR Match DSPy Optimization

**Current Cron**: `ar-match-dspy-optimization` (weekly, Sundays at 5 AM UTC)
**Convex Function**: `convex/functions/orderMatchingOptimization.ts::weeklyOptimization`

### Function Signature
```typescript
internalAction weeklyOptimization(args: { force?: boolean })
```

### Tables Read

| Table | Query Pattern | Index Used | Purpose |
|-------|---------------|------------|---------|
| `order_matching_corrections` | `.collect()` (full scan) | None | Get all corrections for all businesses |
| `dspy_model_versions` | `.withIndex("by_platform_status", q => q.eq("platform", `ar_match_${businessId}`).eq("status", "active"))` | `by_platform_status` | Get active model per business |

### Business Logic Flow

**Identical to Bank Recon Optimization**, except:
- Correction table: `order_matching_corrections`
- Platform key: `ar_match_${businessId}`
- MCP tool: `optimize_ar_match_model`
- Diversity metric: unique customer names

### Safeguards
- Minimum volume: ≥100 corrections (higher threshold due to higher variability)
- Minimum diversity: ≥15 unique customer names
- New data: corrections after `lastCorrectionId`

### External API Calls

- **MCP Lambda**:
  - Tool: `optimize_ar_match_model`
  - Args: `{ corrections, currentModelS3Key }`

---

## 5. Notification Digest

**Current Cron**: `notification-digest` (daily, 8 AM UTC)
**Convex Function**: `convex/functions/notificationJobs.ts::runDigest`

### Function Signature
```typescript
internalMutation runDigest(args: {})
```

### Tables Read

| Table | Query Pattern | Index Used | Purpose |
|-------|---------------|------------|---------|
| `users` | `.collect()` (full scan) | None | Get all users to check digest preferences |
| `business_memberships` | `.withIndex("by_userId", q => q.eq("userId", user._id))` | `by_userId` | Get user's active business memberships |
| `notification_digests` | `.withIndex("by_userId_businessId", q => q.eq("userId", user._id).eq("businessId", businessId))` | `by_userId_businessId` | Get last digest timestamp |
| `notifications` | `.withIndex("by_recipient_business_status", q => q.eq("recipientUserId", user._id).eq("businessId", businessId).eq("status", "unread"))` | `by_recipient_business_status` | Get unread notifications since last digest |

### Business Logic Flow

1. **Query all users**
2. **For each user**:
   - Check digest preference (daily/weekly, default: daily)
   - If weekly, only send on Mondays
   - Get user's active business memberships
3. **For each user + business combo**:
   - Get last digest timestamp from `notification_digests`
   - Query unread notifications since last digest
   - Filter to only those created after `lastDigestSentAt`
   - If no new notifications, skip
   - Check `emailPreferences.globalUnsubscribe`, skip if true
4. **Group notifications by type** (approval, anomaly, compliance, insight, invoice_processing)
5. **Build HTML email** with category sections (show first 5 per category, "... and N more" for rest)
6. **Schedule email send** via `internal.functions.notifications.sendTransactionalEmail`
7. **Update `notification_digests` record** with current timestamp

### Tables Written

| Table | Operation | When |
|-------|-----------|------|
| `notification_digests` | Insert or Patch | After scheduling email send |

### External API Calls

**None** — emails are scheduled via Convex scheduler (internal action)

### Dependencies

- `internal.functions.notifications.sendTransactionalEmail` (action, scheduled via `ctx.scheduler.runAfter`)

### Lambda Implementation Note

This cron is **low-bandwidth** (uses indexed queries, no full table scans except `users` which is small). Consider keeping in Convex unless `users` table grows to 10,000+ users. If migrating:

- Lambda reads user list, notification counts
- Lambda builds email HTML locally
- Lambda calls SES directly (not via Convex action)
- Lambda writes digest timestamp to Convex

---

## 6. E-Invoice Monitoring

**Current Cron**: `einvoice-monitoring` (every 15 minutes)
**Convex Function**: `convex/functions/einvoiceMonitoring.ts::runMonitoringCycle`

### Function Signature
```typescript
internalAction runMonitoringCycle(args: {})
```

### Orchestrates 3 Steps
1. `cleanupStaleRequests` (mutation)
2. `analyzeFailurePatterns` (mutation)
3. `notifyNewPatterns` (action)

---

#### Step 1: Cleanup Stale Requests

**Function**: `internalMutation cleanupStaleRequests`

##### Tables Read

| Table | Query Pattern | Index Used | Purpose |
|-------|---------------|------------|---------|
| `einvoice_request_logs` | `.filter(q => q.eq(q.field("status"), "in_progress"))` | None (full scan filtered) | Find stale in-progress logs |
| `expense_claims` | `.get(log.expenseClaimId)` | Primary key | Get associated claim to update status |

##### Business Logic

1. Get all `in_progress` request logs
2. For logs older than 15 minutes:
   - Mark log as `failed` with error "Lambda timeout"
   - Update associated expense claim status to `failed` (if still `requesting`)

##### Tables Written

| Table | Operation | When |
|-------|-----------|------|
| `einvoice_request_logs` | Patch status → `failed` | For stale logs |
| `expense_claims` | Patch `einvoiceRequestStatus` → `failed` | For associated claims |

---

#### Step 2: Analyze Failure Patterns

**Function**: `internalMutation analyzeFailurePatterns`

##### Tables Read

| Table | Query Pattern | Index Used | Purpose |
|-------|---------------|------------|---------|
| `einvoice_request_logs` | `.filter(q => q.and(q.eq(q.field("status"), "failed"), q.gte(q.field("startedAt"), oneDayAgo)))` | None (full scan filtered) | Get recent failures (last 24h) |
| `einvoice_error_patterns` | `.withIndex("by_fingerprint", q => q.eq("errorFingerprint", fingerprint).eq("merchantDomain", domain))` | `by_fingerprint` | Check if pattern exists |

##### Business Logic

1. Get all failed logs from last 24 hours
2. **For each failure**:
   - Categorize error message using rule-based matcher (402 payment, 429 rate limit, bot blocked, CAPTCHA, infra bug, network error, form validation, merchant logic)
   - Extract merchant domain from URL
   - Check if pattern exists in `einvoice_error_patterns`
   - If exists: increment `occurrenceCount`, update `lastSeenAt`, add to `sampleErrorMessages` (max 3), add to `affectedClaimIds` (max 10)
   - If new: insert pattern with `status: "new"`, `firstSeenAt`, sample message

##### Tables Written

| Table | Operation | When |
|-------|-----------|------|
| `einvoice_error_patterns` | Insert | New error pattern detected |
| `einvoice_error_patterns` | Patch (count, lastSeenAt, samples) | Existing pattern recurs |

---

#### Step 3: Notify New Patterns

**Function**: `internalAction notifyNewPatterns`

##### Tables Read

| Table | Query Pattern | Index Used | Purpose |
|-------|---------------|------------|---------|
| `einvoice_error_patterns` | `.withIndex("by_status", q => q.eq("status", "new"))` | `by_status` | Get unnotified new patterns |

##### Business Logic

1. Get all patterns with `status: "new"` and `notifiedAt: undefined`
2. If none, return
3. Build plain-text email body with pattern summary
4. Send email to `dev@hellogroot.com` via `/api/v1/notifications/send-email`
5. Mark each pattern as notified (set `notifiedAt`)

##### Tables Written

| Table | Operation | When |
|-------|-----------|------|
| `einvoice_error_patterns` | Patch `notifiedAt` | After email sent |

##### External API Calls

- **Internal Notifications API**:
  - Endpoint: `POST /api/v1/notifications/send-email`
  - Headers: `x-api-key: INTERNAL_API_KEY`
  - Body: `{ to, subject, templateType: "plain_text", templateData: { body } }`

---

### Lambda Implementation Note

This cron is **medium-bandwidth** (queries filtered by status + time range). The 15-minute frequency is the concern — 96 runs/day. Recommend:

1. Keep Step 1 (cleanup) in Convex — it's fast and low-bandwidth
2. Migrate Steps 2+3 to Lambda — error pattern analysis can run in Lambda, only write pattern summaries to Convex
3. Consider reducing frequency to 30 minutes (48 runs/day)

---

## 7. Proactive Analysis (Action Center)

**Current Cron**: `proactive-analysis` (every 4 hours)
**Convex Function**: `convex/functions/actionCenterJobs.ts::runProactiveAnalysis`

### Function Signature
```typescript
internalAction runProactiveAnalysis(args: {})
```

### Tables Read

**Extensive — this is the highest-bandwidth cron**. Reads for ALL businesses:

| Table | Query Pattern | Index Used | Purpose |
|-------|---------------|------------|---------|
| `businesses` | `.collect()` (full scan) | None | Get all businesses |
| `business_memberships` | `.withIndex("by_businessId", q => q.eq("businessId", businessId))` | `by_businessId` | Get members per business |
| `journal_entries` | `.withIndex("by_businessId", q => q.eq("businessId", businessId))` | `by_businessId` | Get all entries per business |
| `journal_entry_lines` | `.withIndex("by_journal_entry", q => q.eq("journalEntryId", entryId))` AND `.withIndex("by_business_account", q => q.eq("businessId", businessId))` | Both indexes | Get lines for entries + category analysis |
| `invoices` | `.filter(q => q.and(q.eq(q.field("businessId"), businessId), q.eq(q.field("deletedAt"), undefined)))` | None (full scan filtered) | AP analysis |
| `sales_invoices` | `.filter(q => q.and(q.eq(q.field("businessId"), businessId), q.eq(q.field("deletedAt"), undefined)))` | None (full scan filtered) | AR analysis |
| `expense_claims` | `.filter(q => q.and(q.eq(q.field("businessId"), businessId), q.eq(q.field("deletedAt"), undefined)))` | None (full scan filtered) | Expense claim analysis |
| `actionCenterInsights` | `.withIndex("by_business_priority", q => q.eq("businessId", businessId))` AND `.withIndex("by_category", q => q.eq("category", category))` | Both indexes | Deduplication checks |

### Business Logic Flow (Layer 1: Rule-Based Detection)

**For each business**:

1. **Anomaly Detection** (`runAnomalyDetection`):
   - Get journal entries from last 90 days
   - Get expense lines (account codes 5000-5999)
   - Group by category (account name)
   - Calculate mean + stdDev per category
   - Find transactions >2σ from mean in last 7 days
   - Apply materiality filter (must be >0.1% of monthly expenses)
   - Compute priority based on σ-deviation + materiality %
   - Dedup: skip if insight exists for this journal entry within 90 days
   - Create insight per member

2. **Categorization Detection** (`runCategorizationDetection`):
   - Get expense lines
   - Count uncategorized lines
   - If >10% uncategorized and >10 total lines:
     - Dedup check (90-day window)
     - Create insight per member

3. **Cash Flow Detection** (`runCashFlowDetection`):
   - Get journal entries from last 30 days
   - Calculate total income (account 4000-4999 credits)
   - Calculate total expenses (account 5000-5999 debits)
   - If expenses > 120% of income:
     - Dedup check (90-day window)
     - Create insight per member

4. **Vendor Intelligence Detection** (`runVendorIntelligenceDetection`):
   - **Concentration Risk**: Top suppliers > 40% of total spend
   - **Spending Changes**: 50%+ increase in supplier spend
   - **Risk Scoring**: Overdue payment patterns
   - **Price Anomaly**: Query `vendor_price_anomalies` for high-impact alerts

5. **Critical Alerts Detection** (`runCriticalAlertDetection`):
   - **Payment Deadlines**: Unpaid invoices due in ≤7 days
   - **Cash Runway**: Current balance / daily burn rate < 30 days
   - **Duplicate Transactions**: Same amount + date + description

6. **Stale Payable Detection** (`runStalePayableDetection`):
   - Find unpaid invoices >30 days old with no dueDate

7. **Expense Claim Pattern Detection** (`runExpenseClaimPatternDetection`):
   - **Split Claims**: 3+ claims from same employee on same day totaling >500
   - **Employee Spike**: 100%+ increase in employee's monthly spend vs historical avg

### Tables Written

| Table | Operation | When |
|-------|-----------|------|
| `actionCenterInsights` | Insert (multiple per detection) | For each insight created per member |

### External API Calls

**None** (Layer 1 is pure Convex DB logic)

---

### Layer 2a: LLM Enrichment (Scheduled Async)

**Function**: `internalAction enrichInsight`

After Layer 1 creates insights, this action enriches them with LLM-generated context.

#### Flow

1. Read insight from `actionCenterInsights`
2. Call MCP tools: `detect_anomalies` + `analyze_vendor_risk`
3. Get business summary (income, expenses, top suppliers/merchants, AR/AP status)
4. Call Gemini 3.1 Flash-Lite with structured prompt
5. Sanitize LLM output (replace "vendor" → "supplier")
6. Patch insight with enriched description + recommendation

#### External API Calls

- **MCP Lambda**:
  - Tools: `detect_anomalies`, `analyze_vendor_risk`
- **Gemini API**:
  - Model: `gemini-3.1-flash-lite-preview`
  - Max tokens: 400, temp: 0.3

---

### Lambda Implementation Requirements

This is the **most critical migration** — the proactive analysis cron alone accounts for ~60% of Convex bandwidth.

**Migration strategy**:

1. **Lambda queries Convex for business list** (small query)
2. **Lambda iterates each business**:
   - Query journal entries, invoices, sales invoices, expense claims (via Convex HTTP API)
   - **Process all detection algorithms in Lambda memory** (no Convex bandwidth for statistics)
   - Only write final insight records back to Convex
3. **Lambda calls MCP tools directly** (Lambda → Lambda, zero Convex bandwidth)
4. **Lambda calls Gemini for enrichment** (external API, zero Convex bandwidth)
5. **Lambda writes enriched insights to Convex** (one mutation per insight)

**Bandwidth reduction**: From ~1.5 GB/month to ~50 MB/month (97% reduction)

---

## 8. AI Discovery (Action Center)

**Current Cron**: `ai-discovery` (daily, 3 AM UTC)
**Convex Function**: `convex/functions/actionCenterJobs.ts::runAIDiscovery`

### Function Signature
```typescript
internalAction runAIDiscovery(args: {})
```

### Tables Read

**Same as Proactive Analysis** (queries business summary for LLM context)

| Table | Query Pattern | Index Used | Purpose |
|-------|---------------|------------|---------|
| `businesses` | `.collect()` | None | Get all businesses |
| `business_memberships` | `.withIndex("by_businessId")` | `by_businessId` | Get members |
| `journal_entries` + `journal_entry_lines` | (via `getBusinessSummary`) | Multiple indexes | Build financial summary |
| `invoices`, `sales_invoices`, `expense_claims` | (via `getBusinessSummary`) | Filtered scans | AR/AP/claim counts |
| `actionCenterInsights` | `.withIndex("by_business_priority")` | `by_business_priority` | Get existing insights for dedup |

### Business Logic Flow (Layer 2b: AI Novel Discovery)

1. **For each business**:
   - Get business members
   - Call MCP tools: `detect_anomalies`, `forecast_cash_flow`, `analyze_vendor_risk`
   - Get business summary (structured financial overview)
   - Format MCP intelligence for LLM (anomalies, cash flow alerts, vendor risks)
2. **Call Gemini 3.1 Flash-Lite** with:
   - System prompt: "Find 0-3 actionable insights that standard detection missed. Focus on CROSS-DOMAIN patterns."
   - User prompt: MCP intelligence report + business summary + existing insight titles
   - Response: JSON array of 0-3 insights
3. **Post-LLM validation**:
   - Reject insights using "vendor" term in expense context (domain separation violation)
   - Reject insights about amounts <500 MYR (not CFO-grade)
   - Dedup: skip if similar title exists within 90 days
4. **Create insights** per member

### Tables Written

| Table | Operation | When |
|-------|-----------|------|
| `actionCenterInsights` | Insert | For each valid AI-discovered insight |

### External API Calls

- **MCP Lambda**:
  - Tools: `detect_anomalies`, `forecast_cash_flow`, `analyze_vendor_risk`
- **Gemini API**:
  - Model: `gemini-3.1-flash-lite-preview`
  - Max tokens: 600, temp: 0.4

### Lambda Implementation Requirements

**Similar to Proactive Analysis migration**:

1. Lambda queries business list
2. Lambda calls MCP tools directly (no Convex bandwidth)
3. Lambda gets business summary from Convex (one query per business)
4. Lambda calls Gemini for discovery (external API)
5. Lambda validates results
6. Lambda writes valid insights to Convex (minimal bandwidth)

**Bandwidth reduction**: From ~800 MB/month to ~30 MB/month (96% reduction)

---

## Summary: Bandwidth Impact Per Cron

| Cron Job | Current Frequency | Estimated Bandwidth | Migration Priority |
|----------|-------------------|---------------------|-------------------|
| **Proactive Analysis** | Every 4 hours (6×/day) | ~1.5 GB/month | **CRITICAL** (60% of total) |
| **AI Discovery** | Daily | ~800 MB/month | **HIGH** (32% of total) |
| **E-Invoice Monitoring** | Every 15 min (96×/day) | ~150 MB/month | **MEDIUM** (6% of total) |
| **DSPy Fee Optimization** | Weekly | ~30 MB/month | **LOW** (1.2% of total) |
| **Bank Recon Optimization** | Weekly | ~10 MB/month | **LOW** (0.4% of total) |
| **PO Match Optimization** | Weekly | ~8 MB/month | **LOW** (0.3% of total) |
| **AR Match Optimization** | Weekly | ~5 MB/month | **LOW** (0.2% of total) |
| **Notification Digest** | Daily | ~3 MB/month | **SKIP** (0.1% of total, keep in Convex) |

**Total current**: ~2.5 GB/month
**After migration**: ~150 MB/month (proactive + AI run in Lambda)
**Reduction**: 94%

---

## Implementation Notes

### Common Pattern for All DSPy Optimizations

All 4 DSPy crons (fee, bank recon, PO match, AR match) follow the same pattern:

1. Query correction table (full scan)
2. Group by platform/business
3. Check safeguards (volume, diversity, new data)
4. For each ready entity:
   - Get corrections
   - Get active model
   - Call MCP optimize tool
   - Write result to `dspy_model_versions`
   - Mark corrections consumed

**Lambda reusable handler**:

```typescript
async function handleDspyOptimization(config: {
  correctionTable: string,
  platformKeyPrefix: string,
  mcpToolName: string,
  minVolume: number,
  minDiversity: number
}) {
  // Generic implementation for all 4 DSPy crons
}
```

### Convex HTTP API Access

All Lambda functions will need:

1. **Convex deployment URL**: `https://kindhearted-lynx-129.convex.cloud`
2. **Internal service key**: Stored in SSM Parameter Store (already exists for MCP)
3. **Query endpoint**: `POST /api/query` with `{ path: "functions/module:functionName", args: {...} }`
4. **Mutation endpoint**: `POST /api/mutation` with `{ path: "functions/module:functionName", args: {...} }`

### CDK Stack Addition

Add new Lambda functions to `infra/lib/document-processing-stack.ts` (existing DSPy optimizer stack):

- `finanseal-cron-dspy-optimizations` (single handler for all 4 DSPy crons)
- `finanseal-cron-proactive-analysis` (Action Center Layer 1)
- `finanseal-cron-ai-discovery` (Action Center Layer 2b)
- `finanseal-cron-einvoice-monitor` (E-invoice pattern analysis)

**EventBridge rules**:
- DSPy: `cron(0 2 ? * SUN *)` (Sundays 2 AM UTC, stagger by 1 hour each)
- Proactive: `cron(0 */4 * * ? *)` (every 4 hours)
- AI Discovery: `cron(0 3 * * ? *)` (daily 3 AM UTC)
- E-invoice: `cron(0/30 * * * ? *)` (every 30 minutes — reduced from 15)

---

## Testing Strategy

1. **Unit test each Lambda handler** with mock Convex HTTP responses
2. **Deploy to dev environment** with separate EventBridge rules
3. **Monitor CloudWatch Logs** for correct execution
4. **Verify Convex bandwidth usage** via Convex dashboard (expect 94% reduction)
5. **Compare insight creation** before/after migration (should match exactly)
6. **Gradual rollout**: Migrate one cron at a time, monitor for 1 week each

---

## Rollback Plan

If migration causes issues:

1. Re-enable Convex crons via `convex/crons.ts`
2. Disable EventBridge rules via CDK deploy
3. Lambda functions remain deployed but inactive (no cost unless invoked)
4. Convex crons take over immediately (zero downtime)

---

**Document Status**: Complete — ready for Lambda implementation (issue #353)
