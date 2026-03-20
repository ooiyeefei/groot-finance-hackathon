# Research: EventBridge Migration from Convex Crons

## Overview
This document consolidates research findings for migrating Convex crons to AWS EventBridge + Lambda to reduce database bandwidth usage from ~446MB/month to ~25MB/month (94% reduction).

---

## Decision 1: External Invocation Pattern

### What was chosen
**Convex HTTP API** with deployment key authentication

### Rationale
- Convex provides official HTTP API at `/api/query`, `/api/mutation`, `/api/action` endpoints
- Deployment key authentication allows external services to invoke `internalAction`s
- Zero code duplication - all business logic stays in Convex
- Lambda only needs to make HTTP POST requests with JSON payload

### Alternatives considered
1. **Reimplement business logic in Lambda**
   - ❌ Violates DRY principle
   - ❌ Creates maintenance burden (two codebases)
   - ❌ Risk of logic drift between Convex and Lambda

2. **Direct database access from Lambda**
   - ❌ Convex does not expose direct DB connection strings
   - ❌ Would bypass Convex's reactivity and caching layers
   - ❌ No support for this pattern in Convex documentation

3. **WebSocket connection from Lambda**
   - ❌ Convex WebSocket is designed for client-side use (browsers)
   - ❌ Adds unnecessary complexity for request-response pattern
   - ❌ Deployment key + HTTP is the official pattern for service-to-service

### Implementation details
- Deployment key stored in SSM Parameter Store (`/finanseal/convex-deployment-key`)
- Lambda reads key once per cold start, caches in-memory
- POST request to `https://kindhearted-lynx-129.convex.cloud/api/action`
- Request body: `{ functionPath: "functions/...", args: {...} }`
- Response: JSON result from the Convex action

---

## Decision 2: Lambda Architecture

### What was chosen
**2-Lambda Architecture**:
- **finanseal-scheduled-intelligence** (Node.js 20, ARM_64, 512MB) - Analysis and digest jobs
- **finanseal-dspy-optimizer** (Python 3.11, Docker, x86_64, 1024MB) - Existing DSPy training

### Rationale
- Node.js is ideal for lightweight HTTP orchestration (fast cold start, minimal dependencies)
- Python DSPy optimizer already exists and works perfectly - no need to rebuild
- Node.js dispatcher invokes Python optimizer via Lambda SDK (10ms overhead, acceptable)
- ARM_64 for Node.js = 20% cheaper + faster for I/O-bound tasks
- x86_64 for Python = required for DSPy dependencies (NumPy, PyTorch compiled for x64)

### Alternatives considered
1. **Single Python Lambda for everything**
   - ❌ Python cold start is 2-4x slower than Node.js for simple HTTP tasks
   - ❌ Would need to install requests/boto3 just for HTTP calls
   - ❌ Overkill for analysis jobs that just forward to Convex

2. **Rewrite DSPy optimizer in Node.js**
   - ❌ DSPy is a Python library (no Node.js equivalent)
   - ❌ Massive effort with zero benefit
   - ❌ Existing Lambda works perfectly

3. **Multiple Node.js Lambdas (one per job)**
   - ❌ Increases deployment complexity (14 Lambdas instead of 1)
   - ❌ No cold start benefit (EventBridge keeps functions warm)
   - ❌ Harder to maintain consistent error handling

### Performance expectations
- Node.js dispatcher: <100ms cold start, <50ms warm execution
- Python DSPy optimizer: 1-3 seconds (already acceptable from current crons)
- Lambda invocation overhead: ~10ms (negligible)

---

## Decision 3: Migration Strategy

### What was chosen
**All-at-once migration** with 48-hour verification window

### Rationale
- Only 13 cron jobs to migrate (small scope)
- All jobs are idempotent (safe to double-run if rollback needed)
- 48 hours provides enough data to catch issues (daily jobs run 2x, weekly jobs may not run)
- Clean cutover prevents confusing state where some jobs run from EventBridge, some from Convex

### Alternatives considered
1. **Gradual migration (one job at a time)**
   - ❌ Prolongs uncertainty period
   - ❌ More complex to track which jobs are migrated
   - ❌ No benefit for small job count (only 13 jobs)

2. **Blue-green deployment (parallel for 1 week)**
   - ❌ Would burn bandwidth during overlap (defeats purpose)
   - ❌ Overkill for idempotent jobs
   - ❌ Complicates debugging (which execution caused an issue?)

3. **Immediate deletion (no verification window)**
   - ❌ Too risky if EventBridge rules have typos
   - ❌ Hard to catch silent failures (e.g., wrong schedule expression)
   - ❌ 48 hours is a reasonable safety net

### Verification plan
1. Deploy EventBridge rules + Lambda on Day 1
2. Monitor CloudWatch Logs for 48 hours:
   - Check all 13 jobs execute successfully
   - Verify schedules match original Convex crons
   - Monitor DLQ depth (should stay at 0)
   - Check CloudWatch alarms (should not fire)
3. If all green after 48 hours → delete Convex cron code
4. If issues found → disable EventBridge rules, fix, redeploy, restart verification

---

## Decision 4: Rollback Strategy

### What was chosen
**Fix-forward approach** (disable EventBridge rules, fix, redeploy)

### Rationale
- Rolling back infrastructure (deleting CDK stack) is slow and risky
- Disabling EventBridge rules is instant (one CLI command)
- Convex cron code stays in repo until verification passes
- Fix-forward is standard for infrastructure changes (matches AWS best practices)

### Alternatives considered
1. **Full CDK stack deletion rollback**
   - ❌ Slow (5-10 minutes to delete + redeploy)
   - ❌ Loses CloudWatch Logs from failed attempts
   - ❌ Requires re-enabling Convex crons (more work)

2. **Keep both systems running indefinitely**
   - ❌ Doubles bandwidth usage (defeats purpose)
   - ❌ Complicates debugging (which system ran?)
   - ❌ Never actually migrate

### Rollback procedure
```bash
# Disable all EventBridge rules (stops new invocations)
aws events disable-rule --name finanseal-proactive-analysis
aws events disable-rule --name finanseal-ai-discovery
# ... (13 total rules)

# Fix issue in code
# Redeploy Lambda via CDK
cd infra && npx cdk deploy FinansealScheduledIntelligence-staging

# Re-enable rules
aws events enable-rule --name finanseal-proactive-analysis
# ...
```

---

## Decision 5: Monitoring and Alerting

### What was chosen
**CloudWatch Alarms + SNS** (free tier, native integration)

### Rationale
- AWS Free Tier includes 10 CloudWatch alarms (we need 2)
- SNS email notifications are free (first 1,000 emails/month)
- Native integration with Lambda metrics (no code needed)
- Standard AWS pattern (matches existing stacks)

### Alternatives considered
1. **PagerDuty / Opsgenie**
   - ❌ Costs $29+/month per user
   - ❌ Overkill for batch jobs (not critical real-time services)
   - ❌ Requires integration setup

2. **Custom Slack bot**
   - ❌ Requires maintenance (webhook auth, formatting)
   - ❌ Not critical enough to warrant custom code
   - ❌ Email is sufficient for overnight batch jobs

3. **No monitoring**
   - ❌ Silent failures could go unnoticed for days
   - ❌ DLQ could fill up without alerting
   - ❌ Best practice is to monitor all production crons

### Alarm configuration
| Alarm | Metric | Threshold | Action |
|-------|--------|-----------|--------|
| Lambda Errors | Errors (Sum, 1h) | 3+ errors | SNS email |
| DLQ Depth | ApproximateNumberOfMessagesVisible (Max, 5m) | 5+ messages | SNS email |

---

## Decision 6: Schedule Expressions

### What was chosen
**EventBridge cron expressions** (standard AWS format)

### Rationale
- Convex uses standard cron format (easy to translate)
- EventBridge supports all necessary patterns:
  - Daily: `cron(0 4 * * ? *)`
  - Weekly: `cron(0 2 ? * SUN *)`
  - Monthly: `cron(0 3 1 * ? *)`
- AWS cron is well-documented and tested at scale

### Differences from Convex cron
| Convex | EventBridge | Notes |
|--------|-------------|-------|
| `* 4 * * *` | `cron(0 4 * * ? *)` | Minute must be specified |
| `* 2 * * SUN` | `cron(0 2 ? * SUN *)` | Day-of-month must be `?` when day-of-week is set |

### Timezone handling
- All schedules use **UTC** (EventBridge default)
- 4am UTC = 12pm MYT (Malaysia Time, UTC+8)
- 2am UTC Sunday = 10am MYT Sunday
- Matches existing Convex cron behavior

---

## Decision 7: Error Handling

### What was chosen
**Dead Letter Queue (SQS) + Exponential Backoff Retry**

### Rationale
- EventBridge target configuration supports DLQ out-of-box
- 2 retries with exponential backoff (standard pattern)
- Failed events land in SQS for manual inspection
- 14-day retention allows time to investigate and replay

### Retry configuration
- **maxEventAge**: 2 hours (if Lambda is down, don't queue forever)
- **retryAttempts**: 2 (immediate → +2m → +4m → DLQ)
- **exponentialBackoff**: Automatic by EventBridge

### Why not more retries?
- These are daily/weekly jobs (missing one execution is not critical)
- If a job fails 3 times in a row, something is seriously broken (needs investigation, not blind retries)
- DLQ allows manual replay after fix

---

## Decision 8: SSM Parameter Store vs. Secrets Manager

### What was chosen
**SSM Parameter Store (SecureString type)**

### Rationale
- **Free** on AWS Free Tier (Secrets Manager costs $0.40/secret/month)
- SecureString encrypts at rest with KMS (same security as Secrets Manager)
- Sufficient for this use case (deployment key rotates infrequently)
- Standard pattern used by other FinanSeal stacks

### When to use Secrets Manager instead
- Secrets that require automatic rotation (e.g., DB passwords)
- Cross-account secret sharing
- Integration with RDS Proxy
- None of these apply to Convex deployment key

### Security considerations
- IAM policy scoped to exact parameter path (`/finanseal/convex-deployment-key`)
- Lambda execution role has read-only access
- Key is read once per cold start, cached in-memory (reduces GetParameter API calls)

---

## Decision 9: Lambda Memory and Timeout

### What was chosen
- **Memory**: 512 MB
- **Timeout**: 300 seconds (5 minutes)

### Rationale
- **Memory**: Node.js HTTP orchestration is lightweight (256 MB would work, but 512 MB is safer and only 2x cost)
- **Timeout**: Proactive analysis can take 2-3 minutes for large businesses (5 min is safety buffer)
- AWS Free Tier includes 400,000 GB-seconds/month (512 MB × 300s × 14 invocations = 2,150 GB-seconds, well within limit)

### Cost calculation (worst case)
- 14 jobs/day × 300s × 512 MB = 2,150 GB-seconds/day
- Monthly: 64,500 GB-seconds (16% of free tier)
- Post-free-tier cost: $0.00001667/GB-second × 64,500 = $1.08/month (if over limit)
- Current Convex bandwidth overage: ~$15/month → **93% savings even after free tier**

---

## Summary: Key Constraints Met

✅ **Bandwidth Reduction**: 446 MB/month → 25 MB/month (94% reduction)
✅ **Zero Logic Duplication**: All business logic stays in Convex
✅ **AWS Free Tier Compliant**: 512 MB × 5 min × 14 invocations = well within limits
✅ **Least Privilege IAM**: Scoped SSM read + Lambda invoke permissions only
✅ **Monitoring**: CloudWatch alarms on errors and DLQ depth
✅ **Rollback Safety**: 48-hour verification window before deleting Convex crons
✅ **DRY Principle**: Reuses existing Python DSPy optimizer Lambda

---

## References
- [Convex HTTP API Documentation](https://docs.convex.dev/http-api)
- [EventBridge Cron Expressions](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-cron-expressions.html)
- [AWS Free Tier](https://aws.amazon.com/free/)
- [SSM Parameter Store Pricing](https://aws.amazon.com/systems-manager/pricing/)
