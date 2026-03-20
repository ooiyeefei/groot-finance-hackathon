# Quickstart: EventBridge Migration

## For Developers

### Deploy the Stack
```bash
# Prerequisites
# 1. AWS CLI configured with profile 'groot-finanseal'
# 2. Node.js 20+ installed
# 3. Convex deployment key in SSM (see Setup section below)

# Deploy infrastructure
cd infra
npx cdk deploy FinansealScheduledIntelligence-staging \
  --profile groot-finanseal \
  --region us-west-2
```

### Setup (First-Time Only)

#### 1. Create Convex Deployment Key
```bash
# In Convex dashboard (https://dashboard.convex.dev/deployment/kindhearted-lynx-129/settings):
# 1. Click "Generate deployment key"
# 2. Copy the key (starts with "prod:...")

# Store in SSM Parameter Store
aws ssm put-parameter \
  --name /finanseal/convex-deployment-key \
  --value "prod:YOUR_KEY_HERE" \
  --type SecureString \
  --profile groot-finanseal \
  --region us-west-2
```

#### 2. Build Lambda Package
```bash
cd ../src/lambda/scheduled-intelligence
npm install
npm run build
```

### Verify Deployment

#### Check Lambda Function
```bash
aws lambda get-function \
  --function-name finanseal-scheduled-intelligence \
  --profile groot-finanseal \
  --region us-west-2
```

#### Check EventBridge Rules
```bash
aws events list-rules \
  --name-prefix finanseal- \
  --profile groot-finanseal \
  --region us-west-2
```

Expected output: 13 rules (proactive-analysis, ai-discovery, notification-digest, einvoice-monitoring, ai-daily-digest, dspy-fee, dspy-bank-recon, dspy-po-match, dspy-ar-match, chat-agent-optimization, einvoice-dspy-digest, weekly-email-digest, scheduled-reports)

#### Test Invoke a Job
```bash
# Trigger proactive-analysis manually
aws lambda invoke \
  --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"proactive-analysis"}}' \
  --profile groot-finanseal \
  --region us-west-2 \
  response.json

# Check result
cat response.json
# Expected: {"module":"proactive-analysis","status":"success","durationMs":2450,...}
```

#### Test Each Job Module

Test all 13 migrated jobs individually to verify they work correctly:

```bash
# Daily jobs (4am UTC)
aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"proactive-analysis"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"ai-discovery"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"notification-digest"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"einvoice-monitoring"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"ai-daily-digest"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

# Weekly DSPy jobs (Sunday 2am UTC)
aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"dspy-fee"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"dspy-bank-recon"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"dspy-po-match"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"dspy-ar-match"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"chat-agent-optimization"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

# Weekly digest jobs (Sunday 2am UTC)
aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"einvoice-dspy-digest"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"weekly-email-digest"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json

# Monthly reports (1st of month, 3am UTC)
aws lambda invoke --function-name finanseal-scheduled-intelligence \
  --payload '{"detail":{"module":"scheduled-reports"}}' \
  --profile groot-finanseal --region us-west-2 response.json && cat response.json
```

Expected response format:
```json
{
  "module": "proactive-analysis",
  "status": "success",
  "durationMs": 2450,
  "documentsRead": 127,
  "documentsWritten": 5
}
```

### Monitor Execution

#### CloudWatch Logs
```bash
# Stream live logs
aws logs tail /aws/lambda/finanseal-scheduled-intelligence \
  --follow \
  --profile groot-finanseal \
  --region us-west-2

# Query last 10 invocations
aws logs filter-log-events \
  --log-group-name /aws/lambda/finanseal-scheduled-intelligence \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --profile groot-finanseal \
  --region us-west-2
```

#### Check DLQ Depth
```bash
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name finanseal-scheduled-intelligence-dlq --query 'QueueUrl' --output text --profile groot-finanseal --region us-west-2) \
  --attribute-names ApproximateNumberOfMessages \
  --profile groot-finanseal \
  --region us-west-2
```

Expected: `ApproximateNumberOfMessages: 0` (no failures)

### Add a New Job

#### 1. Create Module File
```typescript
// src/lambda/scheduled-intelligence/modules/my-new-job.ts
import { convexAction } from '../lib/convex-client';
import { JobResult } from '../lib/types';

export async function runMyNewJob(): Promise<Omit<JobResult, 'durationMs'>> {
  const result = await convexAction<{ count: number }>(
    'functions/myJobs:runNewJob',
    {}
  );

  return {
    module: 'my-new-job',
    status: 'success',
    documentsRead: result.count,
    documentsWritten: 0,
  };
}
```

#### 2. Add to Types
```typescript
// src/lambda/scheduled-intelligence/lib/types.ts
export type JobModule =
  | 'proactive-analysis'
  // ... existing modules
  | 'my-new-job'; // Add here
```

#### 3. Add to Handler
```typescript
// src/lambda/scheduled-intelligence/index.ts
import { runMyNewJob } from './modules/my-new-job';

// In switch statement:
case 'my-new-job':
  result = await runMyNewJob();
  break;
```

#### 4. Add to CDK Stack
```typescript
// infra/lib/scheduled-intelligence-stack.ts
const scheduledJobs: ScheduledJob[] = [
  // ... existing jobs
  {
    module: 'my-new-job',
    schedule: 'cron(0 5 * * ? *)', // 5am UTC daily
    description: 'Daily my new job',
  },
];
```

#### 5. Deploy
```bash
cd infra
npx cdk deploy FinansealScheduledIntelligence-staging \
  --profile groot-finanseal \
  --region us-west-2
```

### Rollback

#### Disable All Rules (Emergency Stop)
```bash
# Disable all EventBridge rules
for rule in $(aws events list-rules --name-prefix finanseal- --query 'Rules[].Name' --output text --profile groot-finanseal --region us-west-2); do
  aws events disable-rule --name $rule --profile groot-finanseal --region us-west-2
  echo "Disabled $rule"
done
```

#### Re-Enable Convex Crons
```bash
# In convex/crons.ts, restore commented code
git checkout origin/main -- convex/crons.ts
npx convex deploy --yes
```

### Common Issues

#### "Could not find public function"
**Cause:** Convex action doesn't exist or function path is wrong

**Fix:**
1. Check Convex dashboard for correct function path
2. Verify Convex deployment is up-to-date: `npx convex deploy --yes`
3. Check function is exported as `export const myFunction = internalAction(...)`

#### "Parameter not found: /finanseal/convex-deployment-key"
**Cause:** SSM parameter doesn't exist

**Fix:**
```bash
aws ssm put-parameter \
  --name /finanseal/convex-deployment-key \
  --value "$(npx convex deployments list --json | jq -r '.[0].deploymentKey')" \
  --type SecureString \
  --profile groot-finanseal \
  --region us-west-2
```

#### Lambda Timeout (300s exceeded)
**Cause:** Convex action taking too long

**Fix:**
1. Check CloudWatch Logs for which module timed out
2. Investigate why Convex action is slow (query all businesses?)
3. Optimize Convex action (add indexes, limit results)
4. If unavoidable, increase Lambda timeout in CDK stack

#### DLQ Has Messages
**Cause:** EventBridge retries exhausted

**Fix:**
```bash
# List failed events
aws sqs receive-message \
  --queue-url $(aws sqs get-queue-url --queue-name finanseal-scheduled-intelligence-dlq --query 'QueueUrl' --output text --profile groot-finanseal --region us-west-2) \
  --max-number-of-messages 10 \
  --profile groot-finanseal \
  --region us-west-2

# After fixing issue, replay failed events:
# (Manually invoke Lambda with payloads from DLQ messages)

# Purge DLQ
aws sqs purge-queue \
  --queue-url $(aws sqs get-queue-url --queue-name finanseal-scheduled-intelligence-dlq --query 'QueueUrl' --output text --profile groot-finanseal --region us-west-2) \
  --profile groot-finanseal \
  --region us-west-2
```

---

## For Product/PM

### What Changed
- **Before:** 13 cron jobs ran inside Convex, scanning database tables hourly/daily
- **After:** Same 13 jobs now triggered by AWS EventBridge → Lambda → Convex HTTP API
- **User Impact:** Zero (same schedules, same business logic)
- **Cost Impact:** ~$15/month Convex bandwidth overage → $0 (94% bandwidth reduction)

### Verification Checklist
After 48 hours of EventBridge running:

- [ ] Check CloudWatch Logs: All 13 jobs executed successfully
- [ ] Check DLQ: 0 messages (no failures)
- [ ] Check CloudWatch Alarms: No alarms fired
- [ ] Spot-check results in Groot Finance UI:
  - [ ] Proactive analysis insights appear in Action Center
  - [ ] Notification digests sent at 4am UTC (check email)
  - [ ] E-invoice monitoring cleaned up stale records
  - [ ] DSPy models retrained on Sunday (check S3 bucket for new model versions)

**If all green:** Delete Convex cron code (commit to main)
**If issues:** Disable EventBridge rules, investigate, fix, redeploy

### Rollback Decision Tree
```
Issue detected?
├─ YES → Silent failure (jobs not running)?
│   ├─ YES → Disable EventBridge rules, re-enable Convex crons
│   └─ NO → Errors in logs but jobs completing?
│       ├─ Fix code, redeploy Lambda
│       └─ If unfixable → Rollback
└─ NO → Monitor 48 hours, delete Convex cron code
```

---

## For DevOps

### Infrastructure
- **Lambda:** finanseal-scheduled-intelligence (Node.js 20, ARM_64, 512 MB, 5 min timeout)
- **EventBridge:** 13 rules (daily 4am UTC, weekly Sunday 2am UTC, monthly 1st 3am UTC)
- **SQS:** finanseal-scheduled-intelligence-dlq (14-day retention)
- **SNS:** finanseal-scheduled-intelligence-alarms (email notifications)
- **CloudWatch Alarms:**
  - Lambda errors > 3 in 1 hour
  - DLQ depth > 5 messages

### Monitoring Queries

#### Lambda Invocations (Last 24h)
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=finanseal-scheduled-intelligence \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --profile groot-finanseal \
  --region us-west-2
```

#### Lambda Errors (Last 24h)
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=finanseal-scheduled-intelligence \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --profile groot-finanseal \
  --region us-west-2
```

### Cost Monitoring
```bash
# Lambda cost estimate (last 30 days)
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d '30 days ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://<(echo '{
    "Dimensions": {
      "Key": "SERVICE",
      "Values": ["AWS Lambda"]
    }
  }') \
  --profile groot-finanseal \
  --region us-west-2
```

Expected: $0 (within free tier) or <$2/month (if over free tier)

---

## Next Steps

After 48-hour verification passes:
1. Delete Convex cron code from `convex/crons.ts` (lines 35, 78, 154, 255, 326, 340, 354, 367)
2. Commit to main with message: "chore: delete migrated Convex crons (EventBridge migration complete)"
3. Monitor Convex bandwidth usage: should drop from ~446MB/month to ~25MB/month
4. Update CLAUDE.md with new architecture (EventBridge-first for scheduled jobs)
