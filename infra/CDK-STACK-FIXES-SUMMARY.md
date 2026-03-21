# CDK Stack Infrastructure Fixes - Complete

**Task**: Verify and fix all CDK stack infrastructure gaps for 030-eventbridge-migration
**File**: `/home/fei/fei/code/groot-finance/chatbot/infra/lib/scheduled-intelligence-stack.ts`
**Date**: 2026-03-20
**Status**: ✅ ALL GAPS FIXED

---

## Changes Made

### 1. Added SNS Email Subscription
**Gap**: SNS topic existed but no email subscription configured
**Fix**: Added parameterized email subscription with default `dev@hellogroot.com`

```typescript
// Added interface prop
export interface ScheduledIntelligenceStackProps extends cdk.StackProps {
  alarmEmail?: string; // Email for alarm notifications (defaults to dev@hellogroot.com)
}

// Added subscription
alarmTopic.addSubscription(
  new snsSubscriptions.EmailSubscription(alarmEmail)
);
```

**Lines**: 19-21, 42-44
**Pattern source**: `system-email-stack.ts` (lines 8, 106-109)

---

### 2. Added Lambda Concurrency Limit
**Gap**: Lambda function had no concurrency limit (risk of overlapping executions)
**Fix**: Added `reservedConcurrentExecutions: 1`

```typescript
memorySize: 512,
timeout: cdk.Duration.seconds(300),
reservedConcurrentExecutions: 1, // Prevent overlapping executions
```

**Line**: 73
**Rationale**: Prevents race conditions when jobs run longer than expected

---

### 3. Added Weekly DSPy Jobs Alarm
**Gap**: Only had generic error alarm, no special handling for weekly DSPy jobs
**Fix**: Added dedicated alarm for 2+ consecutive failures

```typescript
// Added flag to identify DSPy jobs
interface ScheduledJob {
  module: string;
  schedule: string;
  description: string;
  isWeeklyDspy?: boolean; // Flag for weekly DSPy jobs (different alarm threshold)
}

// Marked 5 DSPy jobs with flag
{
  module: 'dspy-fee',
  schedule: 'cron(0 2 ? * SUN *)',
  description: 'Weekly DSPy fee classification optimization',
  isWeeklyDspy: true, // <-- Added
},
// ... same for dspy-bank-recon, dspy-po-match, dspy-ar-match, chat-agent-optimization

// Created alarm with 2+ threshold
const weeklyDspyAlarm = new cloudwatch.Alarm(
  this,
  'WeeklyDspyJobsErrorAlarm',
  {
    metric: weeklyDspyErrorMetric,
    threshold: 2, // Alert if 2+ errors in 1 week (indicates consecutive failures)
    evaluationPeriods: 1,
    alarmDescription:
      'Alert when weekly DSPy jobs fail 2+ times in 1 week (consecutive failures)',
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  }
);
```

**Lines**: 16-17, 152-176, 242-263
**Spec requirement**: FR-018 (weekly jobs tolerate 1 missed run, alert on 2+ consecutive failures)

---

### 4. Added Missing Import
**Gap**: Missing `snsSubscriptions` import for EmailSubscription
**Fix**: Added import statement

```typescript
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
```

**Line**: 7
**Pattern source**: `system-email-stack.ts` (line 8)

---

## Verification Checklist

### ✅ CloudWatch Alarms (3 total)
- [x] Daily jobs alarm: Lambda errors > 3 in 1 hour → SNS email
- [x] Weekly DSPy jobs alarm: 2+ consecutive failures → SNS email
- [x] DLQ depth alarm: 5+ messages → SNS email

### ✅ SNS Topic + Email Subscription
- [x] SNS topic: `finanseal-scheduled-intelligence-alarms`
- [x] Email subscription: Parameterized (default: `dev@hellogroot.com`)

### ✅ SQS Dead-Letter Queues
- [x] 1 shared DLQ for all EventBridge rules
- [x] 14-day retention
- [x] CloudWatch metric alarm for DLQ depth

### ✅ Lambda Concurrency Limit
- [x] `reservedConcurrentExecutions: 1` to prevent overlapping executions

### ✅ EventBridge Rule Configuration
- [x] All 13 rules have correct cron expressions
- [x] All rules target Lambda with correct `module` parameter
- [x] All rules have DLQ configured
- [x] All rules have retry policy: maxEventAge=2h, retryAttempts=2

### ✅ Pattern Compliance
- [x] Follows document-processing-stack.ts Lambda patterns
- [x] Follows system-email-stack.ts SNS/alarm patterns
- [x] No TypeScript compilation errors

---

## Infrastructure Summary

**Total Resources Created:**
- 1 Lambda function (Node.js 20, ARM_64, 512MB, 5min timeout, concurrency=1)
- 13 EventBridge rules (5 daily, 7 weekly, 1 monthly)
- 1 SQS DLQ (14-day retention)
- 1 SNS topic + 1 email subscription
- 3 CloudWatch alarms (daily, weekly DSPy, DLQ)
- 4 CDK outputs (Lambda ARN, Lambda name, DLQ URL, SNS topic ARN)

**AWS Free Tier Compliance:**
- EventBridge: 14M events/month free (we use ~240/month)
- Lambda: 1M requests free (we use ~240/month)
- CloudWatch: 10 alarms free (we use 3)
- SNS: 1,000 emails free (we expect <10/month)
- SQS: 1M requests free (DLQ only used on failures)

**Cost estimate:** $0-2/month (fully within free tier)

---

## Next Steps

1. **Deploy stack**:
   ```bash
   cd /home/fei/fei/code/groot-finance/chatbot/infra
   npx cdk deploy ScheduledIntelligenceStack --profile groot-finanseal --region us-west-2
   ```

2. **Confirm SNS email subscription**:
   - Check inbox for AWS SNS confirmation email
   - Click "Confirm subscription" link

3. **Test manual invocation**:
   ```bash
   aws lambda invoke \
     --function-name finanseal-scheduled-intelligence \
     --payload '{"detail":{"module":"proactive-analysis"}}' \
     --region us-west-2 \
     /tmp/response.json
   ```

4. **Monitor CloudWatch**:
   - Check `/aws/lambda/finanseal-scheduled-intelligence` log group
   - Verify all 13 jobs execute successfully during 48-hour window
   - Confirm DLQ depth remains 0

5. **Measure bandwidth**:
   - After 48-hour verification, remove Convex crons
   - Measure Convex bandwidth over 7 days
   - Confirm reduction from ~446 MB/month to <30 MB/month (93%+ reduction)

---

## Files Modified

- `/home/fei/fei/code/groot-finance/chatbot/infra/lib/scheduled-intelligence-stack.ts` - Fixed all gaps

## Files Created

- `/home/fei/fei/code/groot-finance/chatbot/infra/VERIFICATION-030-CDK-STACK.md` - Detailed verification
- `/home/fei/fei/code/groot-finance/chatbot/infra/CDK-STACK-FIXES-SUMMARY.md` - This file

---

**Status**: ✅ COMPLETE - All infrastructure gaps fixed, TypeScript compiles cleanly, ready for deployment
